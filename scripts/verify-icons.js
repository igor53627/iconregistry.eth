const { execSync } = require('child_process');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const fs = require('fs');
const path = require('path');
const os = require('os');

const RPC = process.env.RPC_URL || 'https://virtual.mainnet.eu.rpc.tenderly.co/9101573e-fef6-4f22-8c18-f837422432e1';
const PROXY = process.env.PROXY_ADDRESS || '0x6b82f576a70f0B5D0AF3FA1dbB325E6429FdbF7d';
const ICONS_DIR = process.env.ICONS_DIR || path.join(__dirname, '..', 'icons-64');
const NUM_WORKERS = parseInt(process.env.WORKERS) || 20;

function findAllPngs(dir) {
    const results = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            results.push(...findAllPngs(fullPath));
        } else if (entry.name.endsWith('.png')) {
            results.push(fullPath);
        }
    }
    return results;
}

function pathToSlug(filePath, iconsDir) {
    const relative = path.relative(iconsDir, filePath);
    return relative.replace(/\.png$/, '').replace(/\\/g, '/');
}

if (!isMainThread) {
    // Worker thread
    const { pngs, rpc, proxy, iconsDir } = workerData;
    const results = [];
    
    for (const png of pngs) {
        const slug = pathToSlug(png, iconsDir);
        let passed = true;
        let error = null;
        
        try {
            const slugHash = execSync(`cast keccak "${slug}"`, { encoding: 'utf8' }).trim();
            const localData = fs.readFileSync(png);
            const localHex = '0x' + localData.toString('hex');
            
            // Just test getIconBySlug - if bytes match, everything works
            const cmd = `cast call ${proxy} "getIconBySlug(string)(bytes)" "${slug}" --rpc-url ${rpc}`;
            const onchain = execSync(cmd, { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 }).trim();
            
            passed = onchain.toLowerCase() === localHex.toLowerCase();
        } catch (e) {
            passed = false;
            error = e.message.slice(0, 50);
        }
        
        results.push({ slug, passed, error });
    }
    
    parentPort.postMessage(results);
} else {
    // Main thread
    async function main() {
        console.log('=== IconRegistry Full Verification ===\n');
        console.log(`Workers: ${NUM_WORKERS}`);
        
        const allPngs = findAllPngs(ICONS_DIR);
        console.log(`Total icons: ${allPngs.length}\n`);
        
        const chunkSize = Math.ceil(allPngs.length / NUM_WORKERS);
        const chunks = [];
        for (let i = 0; i < allPngs.length; i += chunkSize) {
            chunks.push(allPngs.slice(i, i + chunkSize));
        }
        
        let completed = 0;
        let passed = 0;
        let failed = 0;
        const failures = [];
        const startTime = Date.now();
        
        const workers = chunks.map((chunk, i) => {
            return new Promise((resolve) => {
                const worker = new Worker(__filename, {
                    workerData: { pngs: chunk, rpc: RPC, proxy: PROXY, iconsDir: ICONS_DIR }
                });
                
                worker.on('message', (results) => {
                    for (const r of results) {
                        completed++;
                        if (r.passed) {
                            passed++;
                        } else {
                            failed++;
                            failures.push(r);
                        }
                    }
                    const pct = (completed / allPngs.length * 100).toFixed(1);
                    const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
                    process.stdout.write(`\r[${pct}%] ${completed}/${allPngs.length} | Passed: ${passed} | Failed: ${failed} | ${elapsed}s`);
                    resolve();
                });
                
                worker.on('error', (err) => {
                    console.error(`Worker ${i} error:`, err);
                    resolve();
                });
            });
        });
        
        await Promise.all(workers);
        
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`\n\n=== RESULTS ===`);
        console.log(`Total: ${allPngs.length}`);
        console.log(`Passed: ${passed}`);
        console.log(`Failed: ${failed}`);
        console.log(`Success rate: ${(passed / allPngs.length * 100).toFixed(2)}%`);
        console.log(`Time: ${elapsed}s`);
        
        if (failures.length > 0 && failures.length <= 50) {
            console.log('\nFailures:');
            failures.forEach(f => console.log(`  - ${f.slug}: ${f.error || 'data mismatch'}`));
        } else if (failures.length > 50) {
            console.log(`\nFirst 50 failures:`);
            failures.slice(0, 50).forEach(f => console.log(`  - ${f.slug}: ${f.error || 'data mismatch'}`));
        }
    }
    
    main().catch(console.error);
}
