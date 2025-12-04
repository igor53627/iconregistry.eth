const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Configuration
const MEV_RPCS = [
    'https://rpc.mevblocker.io',
    'https://eth.llamarpc.com',
    'https://eth.merkle.io'
];

const PRIVATE_KEY = process.env.PRIVATE_KEY;
const PROXY_ADDRESS = process.env.PROXY_ADDRESS;
const ICONS_DIR = process.env.ICONS_DIR || path.join(__dirname, '..', 'icons-64');
const MAX_GAS_PRICE_GWEI = parseFloat(process.env.MAX_GAS_PRICE_GWEI) || 0.05;
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE) || 50; // Larger batches with 60M limit
const OUTPUT_FILE = process.env.OUTPUT_FILE || path.join(__dirname, '..', 'docs', 'mainnet-deployment-report.md');
const RESUME_FROM = parseInt(process.env.RESUME_FROM) || 0; // Resume from batch N
const DRY_RUN = process.env.DRY_RUN === 'true';

// Gas limit post-Fusaka
const POST_FUSAKA_GAS_LIMIT = 60_000_000;
const ESTIMATED_GAS_PER_ICON = 950_000; // From Tenderly testing
const SAFE_BATCH_GAS = 45_000_000; // Stay under block limit

if (!PRIVATE_KEY || !PROXY_ADDRESS) {
    console.error('Required: PRIVATE_KEY, PROXY_ADDRESS');
    console.error('Optional: MAX_GAS_PRICE_GWEI (default: 0.05), BATCH_SIZE (default: 50)');
    console.error('          RESUME_FROM (default: 0), DRY_RUN (default: false)');
    process.exit(1);
}

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

function pathToSlug(filePath) {
    const relative = path.relative(ICONS_DIR, filePath);
    return relative.replace(/\.png$/, '').replace(/\\/g, '/');
}

function formatNumber(n) {
    return n.toLocaleString('en-US');
}

async function getGasPrice(rpc) {
    const cmd = `cast gas-price --rpc-url ${rpc}`;
    const result = execSync(cmd).toString().trim();
    return BigInt(result);
}

async function checkRpcHealth(rpc) {
    try {
        const cmd = `cast block-number --rpc-url ${rpc}`;
        execSync(cmd, { timeout: 5000 });
        return true;
    } catch {
        return false;
    }
}

async function selectRpc() {
    for (const rpc of MEV_RPCS) {
        if (await checkRpcHealth(rpc)) {
            return rpc;
        }
    }
    throw new Error('No healthy RPC available');
}

async function waitForGasPrice(rpc, maxGwei) {
    const maxWei = BigInt(Math.floor(maxGwei * 1e9));
    
    while (true) {
        const gasPrice = await getGasPrice(rpc);
        const gasPriceGwei = Number(gasPrice) / 1e9;
        
        if (gasPrice <= maxWei) {
            return gasPrice;
        }
        
        console.log(`Gas: ${gasPriceGwei.toFixed(4)} gwei > ${maxGwei} gwei - waiting...`);
        await new Promise(r => setTimeout(r, 12000));
    }
}

async function getCurrentGasLimit(rpc) {
    try {
        const cmd = `cast block --rpc-url ${rpc} --json`;
        const result = JSON.parse(execSync(cmd).toString());
        return BigInt(result.gasLimit);
    } catch {
        return BigInt(30_000_000); // Pre-Fusaka default
    }
}

async function verifyFusakaActive(rpc) {
    const gasLimit = await getCurrentGasLimit(rpc);
    if (gasLimit < BigInt(POST_FUSAKA_GAS_LIMIT)) {
        console.error(`Gas limit ${gasLimit} < ${POST_FUSAKA_GAS_LIMIT} - Fusaka not yet active!`);
        console.error('Run: node scripts/monitor-fusaka.js');
        process.exit(1);
    }
    console.log(`Block gas limit: ${formatNumber(Number(gasLimit))} - Fusaka active!`);
    return true;
}

function calculateOptimalBatchSize(icons) {
    // Calculate average icon size
    let totalBytes = 0;
    const sampleSize = Math.min(100, icons.length);
    for (let i = 0; i < sampleSize; i++) {
        totalBytes += fs.statSync(icons[i]).size;
    }
    const avgBytes = totalBytes / sampleSize;
    
    // Estimate gas: ~20k base + ~200 per byte + overhead
    const estimatedGasPerIcon = 20000 + (avgBytes * 200) + 50000;
    const optimalBatch = Math.floor(SAFE_BATCH_GAS / estimatedGasPerIcon);
    
    console.log(`Average icon size: ${formatNumber(Math.round(avgBytes))} bytes`);
    console.log(`Estimated gas per icon: ${formatNumber(Math.round(estimatedGasPerIcon))}`);
    console.log(`Optimal batch size: ${optimalBatch} (using ${Math.min(optimalBatch, BATCH_SIZE)})`);
    
    return Math.min(optimalBatch, BATCH_SIZE);
}

function generateReport(data) {
    const {
        proxyAddress,
        startTime,
        endTime,
        batches,
        totalIcons,
        successCount,
        failCount,
        totalBytes,
        totalGasUsed,
        avgGasPrice
    } = data;

    const duration = ((endTime - startTime) / 1000 / 60).toFixed(1);
    const avgGasPerIcon = successCount > 0 ? totalGasUsed / BigInt(successCount) : BigInt(0);
    const ethCost = Number(totalGasUsed) * avgGasPrice / 1e18;

    let md = `# IconRegistry Mainnet Deployment Report

Generated: ${new Date().toISOString()}

## Summary

| Metric | Value |
|--------|-------|
| Network | Ethereum Mainnet (post-Fusaka) |
| Chain ID | 1 |
| Proxy Contract | \`${proxyAddress}\` |
| Total Icons | ${formatNumber(totalIcons)} |
| Successfully Deployed | ${formatNumber(successCount)} |
| Failed | ${formatNumber(failCount)} |
| Total Data Size | ${(totalBytes / 1024 / 1024).toFixed(2)} MB |
| Deployment Duration | ${duration} minutes |

## Gas Costs

| Metric | Value |
|--------|-------|
| Total Gas Used | ${formatNumber(Number(totalGasUsed))} |
| Average Gas per Icon | ${formatNumber(Number(avgGasPerIcon))} |
| Average Gas Price | ${(avgGasPrice / 1e9).toFixed(4)} gwei |
| Total ETH Cost | ${ethCost.toFixed(6)} ETH |

## Batch Transactions

| Batch | Icons | Gas Used | Tx Hash |
|-------|-------|----------|---------|
`;

    batches.forEach((batch, i) => {
        const status = batch.success ? '' : ' (FAILED)';
        const txLink = batch.txHash 
            ? `[\`${batch.txHash.slice(0, 10)}...\`](https://etherscan.io/tx/${batch.txHash})`
            : 'N/A';
        md += `| ${i + 1}${status} | ${batch.iconCount} | ${formatNumber(Number(batch.gasUsed))} | ${txLink} |\n`;
    });

    md += `
## Verification

\`\`\`bash
# Check total icons
cast call ${proxyAddress} "totalIcons()(uint256)" --rpc-url https://eth.llamarpc.com

# Get icon by slug
cast call ${proxyAddress} "getIconBySlug(string)(bytes)" "chains/ethereum" --rpc-url https://eth.llamarpc.com
\`\`\`

---

*Deployed by iconregistry.eth*
`;

    return md;
}

async function main() {
    console.log('=== IconRegistry Mainnet Icon Upload ===\n');
    console.log(`Max gas price: ${MAX_GAS_PRICE_GWEI} gwei`);
    console.log(`Proxy: ${PROXY_ADDRESS}`);
    if (DRY_RUN) console.log('*** DRY RUN MODE ***\n');
    
    const rpc = await selectRpc();
    console.log(`RPC: ${rpc}`);
    
    // Verify Fusaka is active
    await verifyFusakaActive(rpc);
    
    const pngs = findAllPngs(ICONS_DIR);
    console.log(`\nFound ${formatNumber(pngs.length)} PNG files`);
    
    const batchSize = calculateOptimalBatchSize(pngs);
    
    const reportData = {
        proxyAddress: PROXY_ADDRESS,
        startTime: Date.now(),
        endTime: null,
        batches: [],
        totalIcons: pngs.length,
        successCount: 0,
        failCount: 0,
        totalBytes: 0,
        totalGasUsed: BigInt(0),
        avgGasPrice: 0
    };
    
    let totalGasPriceSum = BigInt(0);
    let txCount = 0;
    
    const totalBatches = Math.ceil(pngs.length / batchSize);
    console.log(`\nTotal batches: ${totalBatches}`);
    if (RESUME_FROM > 0) console.log(`Resuming from batch: ${RESUME_FROM}`);
    console.log('');
    
    for (let batchNum = 0; batchNum < totalBatches; batchNum++) {
        const startIdx = batchNum * batchSize;
        const batch = pngs.slice(startIdx, startIdx + batchSize);
        
        // Skip if resuming
        if (batchNum < RESUME_FROM) {
            reportData.batches.push({
                index: batchNum + 1,
                slugs: batch.map(pathToSlug),
                iconCount: batch.length,
                bytes: 0,
                gasUsed: BigInt(0),
                txHash: 'SKIPPED',
                success: true
            });
            continue;
        }
        
        const slugs = [];
        const hexDatas = [];
        const widths = [];
        const heights = [];
        let batchBytes = 0;
        
        for (const png of batch) {
            const slug = pathToSlug(png);
            const data = fs.readFileSync(png);
            slugs.push(slug);
            hexDatas.push('0x' + data.toString('hex'));
            widths.push(64);
            heights.push(64);
            batchBytes += data.length;
        }
        
        const batchRecord = {
            index: batchNum + 1,
            slugs,
            iconCount: batch.length,
            bytes: batchBytes,
            gasUsed: BigInt(0),
            txHash: null,
            success: false
        };
        
        // Wait for acceptable gas price
        const gasPrice = await waitForGasPrice(rpc, MAX_GAS_PRICE_GWEI);
        totalGasPriceSum += gasPrice;
        txCount++;
        
        const slugsArg = `[${slugs.map(s => `"${s}"`).join(',')}]`;
        const datasArg = `[${hexDatas.join(',')}]`;
        const widthsArg = `[${widths.join(',')}]`;
        const heightsArg = `[${heights.join(',')}]`;
        
        if (DRY_RUN) {
            console.log(`[DRY RUN] Batch ${batchNum + 1}/${totalBatches}: ${batch.length} icons, ${formatNumber(batchBytes)} bytes`);
            batchRecord.success = true;
            reportData.successCount += batch.length;
            reportData.totalBytes += batchBytes;
        } else {
            try {
                const cmd = `cast send ${PROXY_ADDRESS} "setIconsBatch(string[],bytes[],uint32[],uint32[])" '${slugsArg}' '${datasArg}' '${widthsArg}' '${heightsArg}' --private-key ${PRIVATE_KEY} --rpc-url ${rpc} --gas-price ${gasPrice} --json`;
                
                const result = execSync(cmd, { maxBuffer: 100 * 1024 * 1024 }).toString();
                const json = JSON.parse(result);
                
                batchRecord.gasUsed = BigInt(json.gasUsed);
                batchRecord.txHash = json.transactionHash;
                batchRecord.success = true;
                
                reportData.totalGasUsed += batchRecord.gasUsed;
                reportData.totalBytes += batchBytes;
                reportData.successCount += batch.length;
                
                const progress = ((startIdx + batch.length) / pngs.length * 100).toFixed(1);
                const gasPriceGwei = (Number(gasPrice) / 1e9).toFixed(4);
                console.log(`[${progress}%] Batch ${batchNum + 1}/${totalBatches}: ${batch.length} icons, ${formatNumber(Number(batchRecord.gasUsed))} gas @ ${gasPriceGwei} gwei`);
            } catch (err) {
                reportData.failCount += batch.length;
                console.error(`Batch ${batchNum + 1} FAILED:`, err.message.slice(0, 200));
                console.error(`Resume with: RESUME_FROM=${batchNum} node scripts/upload-icons-mainnet.js`);
            }
        }
        
        reportData.batches.push(batchRecord);
        
        // Small delay between batches to avoid rate limiting
        await new Promise(r => setTimeout(r, 1000));
    }
    
    reportData.endTime = Date.now();
    reportData.avgGasPrice = txCount > 0 ? Number(totalGasPriceSum / BigInt(txCount)) : 0;
    
    // Generate and save report
    const report = generateReport(reportData);
    fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
    fs.writeFileSync(OUTPUT_FILE, report);
    
    console.log('\n=== COMPLETE ===');
    console.log(`Icons: ${reportData.successCount}/${reportData.totalIcons}`);
    console.log(`Gas: ${formatNumber(Number(reportData.totalGasUsed))}`);
    console.log(`Report: ${OUTPUT_FILE}`);
    
    if (reportData.failCount > 0) {
        console.log(`\nFailed: ${reportData.failCount} icons`);
        console.log('Check report for failed batches and resume with RESUME_FROM=N');
    }
}

main().catch(console.error);
