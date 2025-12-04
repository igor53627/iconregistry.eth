const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

// ========== CONFIG ==========
const POST_FUSAKA_GAS_LIMIT = 59_000_000; // Slightly below 60M to account for EIP-1559 variance

const MEV_RPCS = [
    'https://ethereum-rpc.publicnode.com',
    'https://eth.llamarpc.com',
    'https://eth.drpc.org',
    'https://rpc.mevblocker.io',
    'https://eth.merkle.io',
    'https://1rpc.io/eth'
];

const GAS_PRICE_BUFFER_PERCENT = 20; // Add 20% buffer to handle base fee fluctuations

const PROXY_ADDRESS = '0x342e808c40D8E00656fEd124CA11aEcBB96c61Fc';
const ICONS_DIR = path.join(__dirname, '..', 'icons-64');
const MAX_GAS_PRICE_GWEI = parseFloat(process.env.MAX_GAS_PRICE_GWEI) || 0.05;
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE) || 5;
const SKIP_EXISTING = process.env.SKIP_EXISTING !== 'false'; // Default true
const RESUME_FROM = parseInt(process.env.RESUME_FROM) || 0;
const OUTPUT_FILE = path.join(__dirname, '..', 'docs', 'mainnet-deployment-report.md');

const VAULT_ADDR = process.env.VAULT_ADDR || 'http://127.0.0.1:8200';
const VAULT_TOKEN = process.env.VAULT_TOKEN;

// ========== VAULT ==========
async function getPrivateKey() {
    if (process.env.PRIVATE_KEY) return process.env.PRIVATE_KEY;
    
    if (!VAULT_TOKEN) {
        console.error('Need VAULT_TOKEN or PRIVATE_KEY');
        process.exit(1);
    }
    
    return new Promise((resolve, reject) => {
        const url = new URL(`${VAULT_ADDR}/v1/secret/data/iconregistry`);
        const client = url.protocol === 'https:' ? https : http;
        
        client.get(url, { headers: { 'X-Vault-Token': VAULT_TOKEN } }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    resolve(json.data.data.private_key);
                } catch (e) {
                    reject(e);
                }
            });
        }).on('error', reject);
    });
}

// ========== FUSAKA MONITORING ==========
async function waitForFusaka() {
    console.log('=== Checking Fusaka Activation ===\n');
    console.log(`Required gas limit: ${POST_FUSAKA_GAS_LIMIT.toLocaleString()}\n`);
    
    // Check gas limit directly instead of beacon slot (more reliable)
    let rpcIdx = 0;
    while (true) {
        try {
            const rpc = MEV_RPCS[rpcIdx % MEV_RPCS.length];
            const result = execSync(`cast block --rpc-url ${rpc} --json`).toString();
            const block = JSON.parse(result);
            const gasLimit = BigInt(block.gasLimit);
            
            console.log(`Block ${block.number} | Gas limit: ${gasLimit.toLocaleString()}`);
            
            if (gasLimit >= BigInt(POST_FUSAKA_GAS_LIMIT)) {
                console.log('\n*** FUSAKA ACTIVATED (60M gas limit confirmed) ***\n');
                return true;
            }
            
            console.log('Waiting for 60M gas limit...');
        } catch (err) {
            console.log('RPC error, rotating...');
            rpcIdx++;
        }
        
        await new Promise(r => setTimeout(r, 6000));
    }
}

// ========== GAS & RPC ==========
async function getGasPrice(rpc) {
    const result = execSync(`cast gas-price --rpc-url ${rpc}`).toString().trim();
    return BigInt(result);
}

let currentRpcIndex = 0;

function getCurrentRpc() {
    return MEV_RPCS[currentRpcIndex];
}

function rotateRpc() {
    currentRpcIndex = (currentRpcIndex + 1) % MEV_RPCS.length;
    console.log(`Rotating to RPC: ${MEV_RPCS[currentRpcIndex]}`);
    return MEV_RPCS[currentRpcIndex];
}

async function selectRpc() {
    for (let i = 0; i < MEV_RPCS.length; i++) {
        const rpc = MEV_RPCS[i];
        try {
            execSync(`cast block-number --rpc-url ${rpc}`, { timeout: 5000 });
            currentRpcIndex = i;
            return rpc;
        } catch {}
    }
    throw new Error('No healthy RPC');
}

async function waitForGasPrice(rpc, maxGwei) {
    const maxWei = BigInt(Math.floor(maxGwei * 1e9));
    
    while (true) {
        const gasPrice = await getGasPrice(rpc);
        if (gasPrice <= maxWei) {
            // Return at least the current gas price to avoid "less than base fee" errors
            return gasPrice;
        }
        
        const gwei = (Number(gasPrice) / 1e9).toFixed(4);
        process.stdout.write(`\rGas: ${gwei} gwei > ${maxGwei} gwei - waiting...    `);
        await new Promise(r => setTimeout(r, 6000));
    }
}

async function verifyFusakaActive(rpc) {
    const result = execSync(`cast block --rpc-url ${rpc} --json`).toString();
    const block = JSON.parse(result);
    const gasLimit = BigInt(block.gasLimit);
    
    if (gasLimit < BigInt(POST_FUSAKA_GAS_LIMIT)) {
        console.log(`Gas limit: ${gasLimit} - Fusaka not active yet, waiting...`);
        return false;
    }
    console.log(`Gas limit: ${gasLimit.toLocaleString()} - Fusaka confirmed!`);
    return true;
}

// ========== ICONS ==========
function findAllPngs(dir) {
    const results = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) results.push(...findAllPngs(fullPath));
        else if (entry.name.endsWith('.png')) results.push(fullPath);
    }
    return results;
}

function pathToSlug(filePath) {
    return path.relative(ICONS_DIR, filePath).replace(/\.png$/, '').replace(/\\/g, '/');
}

function slugToHash(slug) {
    // Use cast to compute keccak256
    const result = execSync(`cast keccak "${slug}"`).toString().trim();
    return result;
}

async function getUploadedSlugs(rpc) {
    console.log('Fetching already uploaded icons...');
    const total = parseInt(execSync(`cast call ${PROXY_ADDRESS} "totalIcons()(uint256)" --rpc-url ${rpc}`).toString().trim());
    console.log(`Found ${total} icons on-chain`);
    
    const uploaded = new Set();
    const pageSize = 100;
    
    for (let offset = 0; offset < total; offset += pageSize) {
        const result = execSync(`cast call ${PROXY_ADDRESS} "getSlugsPaginated(uint256,uint256)(bytes32[])" ${offset} ${pageSize} --rpc-url ${rpc}`).toString().trim();
        // Parse the bytes32[] result
        const hashes = result.replace(/[\[\]\s]/g, '').split(',').filter(h => h.length > 0);
        hashes.forEach(h => uploaded.add(h.toLowerCase()));
    }
    
    console.log(`Loaded ${uploaded.size} slug hashes`);
    return uploaded;
}

// ========== MAIN ==========
async function main() {
    console.log('=== IconRegistry Fusaka Deployment ===\n');
    console.log(`Proxy: ${PROXY_ADDRESS}`);
    console.log(`Max gas price: ${MAX_GAS_PRICE_GWEI} gwei`);
    console.log(`Batch size: ${BATCH_SIZE}`);
    if (RESUME_FROM > 0) console.log(`Resuming from batch: ${RESUME_FROM}`);
    console.log('');
    
    // Get private key from Vault
    const privateKey = await getPrivateKey();
    console.log('Private key loaded from Vault');
    
    // Wait for Fusaka
    await waitForFusaka();
    
    // Select RPC and verify Fusaka
    const rpc = await selectRpc();
    console.log(`Using RPC: ${rpc}`);
    
    // Wait a few blocks for network to stabilize
    console.log('Waiting 2 blocks for network stability...');
    await new Promise(r => setTimeout(r, 24000));
    
    // Verify Fusaka is active
    while (!await verifyFusakaActive(rpc)) {
        await new Promise(r => setTimeout(r, 12000));
    }
    
    // Find all icons
    let pngs = findAllPngs(ICONS_DIR);
    console.log(`\nFound ${pngs.length.toLocaleString()} total icons`);
    
    // Filter out already uploaded icons
    if (SKIP_EXISTING) {
        const uploadedHashes = await getUploadedSlugs(rpc);
        const originalCount = pngs.length;
        pngs = pngs.filter(png => {
            const slug = pathToSlug(png);
            const hash = slugToHash(slug).toLowerCase();
            return !uploadedHashes.has(hash);
        });
        console.log(`Skipping ${originalCount - pngs.length} already uploaded`);
        console.log(`Remaining: ${pngs.length} icons to upload`);
    }
    
    if (pngs.length === 0) {
        console.log('\nAll icons already uploaded!');
        return;
    }
    
    const totalBatches = Math.ceil(pngs.length / BATCH_SIZE);
    console.log(`Total batches: ${totalBatches}`);
    
    const reportData = {
        startTime: Date.now(),
        batches: [],
        successCount: 0,
        failCount: 0,
        totalBytes: 0,
        totalGasUsed: BigInt(0)
    };
    
    for (let batchNum = 0; batchNum < totalBatches; batchNum++) {
        if (batchNum < RESUME_FROM) continue;
        
        const startIdx = batchNum * BATCH_SIZE;
        const batch = pngs.slice(startIdx, startIdx + BATCH_SIZE);
        
        console.log(`\nPreparing batch ${batchNum + 1}/${totalBatches}...`);
        
        const slugs = [];
        const hexDatas = [];
        let batchBytes = 0;
        
        for (const png of batch) {
            const data = fs.readFileSync(png);
            slugs.push(pathToSlug(png));
            hexDatas.push('0x' + data.toString('hex'));
            batchBytes += data.length;
        }
        
        console.log(`Batch ready: ${batch.length} icons, ${(batchBytes/1024).toFixed(1)} KB`);
        
        // Wait for acceptable gas price
        const gasPrice = await waitForGasPrice(rpc, MAX_GAS_PRICE_GWEI);
        console.log(`Gas price OK: ${(Number(gasPrice) / 1e9).toFixed(4)} gwei`);
        const gasPriceGwei = (Number(gasPrice) / 1e9).toFixed(4);
        
        const slugsArg = `[${slugs.map(s => `"${s}"`).join(',')}]`;
        const datasArg = `[${hexDatas.join(',')}]`;
        const widthsArg = `[${Array(batch.length).fill(64).join(',')}]`;
        const heightsArg = `[${Array(batch.length).fill(64).join(',')}]`;
        
        let success = false;
        let lastErr = null;
        
        // Try all RPCs before giving up
        for (let rpcAttempt = 0; rpcAttempt < MEV_RPCS.length && !success; rpcAttempt++) {
            const currentRpc = getCurrentRpc();
            
            try {
                // Re-check gas price for current RPC and add buffer
                const baseGasPrice = await getGasPrice(currentRpc);
                const bufferedGasPrice = baseGasPrice + (baseGasPrice * BigInt(GAS_PRICE_BUFFER_PERCENT) / 100n);
                const gwei = (Number(bufferedGasPrice) / 1e9).toFixed(4);
                
                const cmd = `cast send ${PROXY_ADDRESS} "setIconsBatch(string[],bytes[],uint32[],uint32[])" '${slugsArg}' '${datasArg}' '${widthsArg}' '${heightsArg}' --private-key ${privateKey} --rpc-url ${currentRpc} --gas-price ${bufferedGasPrice} --timeout 180 --json`;
                
                const result = execSync(cmd, { maxBuffer: 100 * 1024 * 1024 }).toString();
                const json = JSON.parse(result);
                
                const gasUsed = BigInt(json.gasUsed);
                reportData.totalGasUsed += gasUsed;
                reportData.totalBytes += batchBytes;
                reportData.successCount += batch.length;
                
                reportData.batches.push({
                    index: batchNum + 1,
                    iconCount: batch.length,
                    gasUsed,
                    txHash: json.transactionHash,
                    success: true
                });
                
                const progress = ((startIdx + batch.length) / pngs.length * 100).toFixed(1);
                console.log(`[${progress}%] Batch ${batchNum + 1}/${totalBatches}: ${batch.length} icons, ${Number(gasUsed).toLocaleString()} gas @ ${gwei} gwei`);
                success = true;
                
            } catch (err) {
                lastErr = err;
                const errMsg = err.message || '';
                
                // Check if it's a timeout - tx may have landed
                if (errMsg.includes('timeout') || errMsg.includes('not confirmed')) {
                    console.log(`\nTimeout on batch ${batchNum + 1} - checking if tx landed...`);
                    await new Promise(r => setTimeout(r, 12000)); // Wait for next block
                    
                    // Check if first icon in batch was uploaded
                    const testSlug = slugs[0];
                    const testHash = slugToHash(testSlug).toLowerCase();
                    try {
                        const result = execSync(`cast call ${PROXY_ADDRESS} "icons(bytes32)(address,uint32,uint32,uint32)" ${testHash} --rpc-url ${currentRpc}`).toString();
                        if (!result.includes('0x0000000000000000000000000000000000000000')) {
                            console.log(`Batch ${batchNum + 1} actually succeeded (tx landed despite timeout)`);
                            reportData.successCount += batch.length;
                            reportData.batches.push({ index: batchNum + 1, iconCount: batch.length, success: true, note: 'timeout-recovered' });
                            success = true;
                            continue;
                        }
                    } catch {}
                }
                
                console.error(`\nBatch ${batchNum + 1} failed on ${currentRpc}: ${errMsg.slice(0, 80)}`);
                rotateRpc();
            }
        }
        
        if (!success) {
            reportData.failCount += batch.length;
            reportData.batches.push({ index: batchNum + 1, iconCount: batch.length, success: false });
            
            if (batchNum === RESUME_FROM) {
                console.error(`\nAll RPCs failed on first batch. Exiting.`);
                console.error(`Error: ${lastErr?.message?.slice(0, 200)}`);
                process.exit(1);
            }
            
            console.error(`Resume with: RESUME_FROM=${batchNum} VAULT_TOKEN=iconregistry node scripts/fusaka-deploy.js\n`);
        }
        
        // Small delay
        await new Promise(r => setTimeout(r, 500));
    }
    
    reportData.endTime = Date.now();
    
    // Summary
    const duration = ((reportData.endTime - reportData.startTime) / 1000 / 60).toFixed(1);
    const ethCost = Number(reportData.totalGasUsed) * MAX_GAS_PRICE_GWEI / 1e9;
    
    console.log('\n=== DEPLOYMENT COMPLETE ===');
    console.log(`Icons: ${reportData.successCount}/${pngs.length}`);
    console.log(`Failed: ${reportData.failCount}`);
    console.log(`Gas used: ${Number(reportData.totalGasUsed).toLocaleString()}`);
    console.log(`Est. cost: ${ethCost.toFixed(6)} ETH`);
    console.log(`Duration: ${duration} minutes`);
    
    if (reportData.failCount > 0) {
        console.log('\nSome batches failed. Check output and resume with RESUME_FROM=N');
    }
    
    // Save report
    const report = `# IconRegistry Mainnet Deployment Report

Generated: ${new Date().toISOString()}

## Summary

| Metric | Value |
|--------|-------|
| Network | Ethereum Mainnet (post-Fusaka) |
| Proxy | \`${PROXY_ADDRESS}\` |
| Total Icons | ${pngs.length.toLocaleString()} |
| Deployed | ${reportData.successCount.toLocaleString()} |
| Failed | ${reportData.failCount.toLocaleString()} |
| Total Gas | ${Number(reportData.totalGasUsed).toLocaleString()} |
| Duration | ${duration} minutes |

## Transactions

| Batch | Icons | Gas | Tx Hash |
|-------|-------|-----|---------|
${reportData.batches.map(b => 
    `| ${b.index} | ${b.iconCount} | ${b.success ? Number(b.gasUsed).toLocaleString() : 'FAILED'} | ${b.txHash ? `[\`${b.txHash.slice(0,10)}...\`](https://etherscan.io/tx/${b.txHash})` : '-'} |`
).join('\n')}
`;
    
    fs.writeFileSync(OUTPUT_FILE, report);
    console.log(`\nReport saved: ${OUTPUT_FILE}`);
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
