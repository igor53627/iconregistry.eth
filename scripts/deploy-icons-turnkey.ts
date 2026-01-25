/**
 * IconRegistry Deployment Script with Turnkey Signing
 * 
 * This script uploads icons to the IconRegistry contract using Turnkey for secure signing.
 * It replaces the need for raw private keys with Turnkey's secure enclave signing.
 * 
 * Usage:
 *   # With environment variables
 *   TURNKEY_API_PUBLIC_KEY=... TURNKEY_API_PRIVATE_KEY=... TURNKEY_ORGANIZATION_ID=... TURNKEY_SIGN_WITH=... tsx scripts/deploy-icons-turnkey.ts
 * 
 *   # With options
 *   BATCH_SIZE=10 MAX_GAS_PRICE_GWEI=0.05 tsx scripts/deploy-icons-turnkey.ts
 */

import { createTurnkeySigner } from './turnkey-signer';
import { createPublicClient, http, encodeFunctionData, parseGwei, formatGwei } from 'viem';
import { mainnet } from 'viem/chains';
import * as fs from 'fs';
import * as path from 'path';

// ========== CONFIG ==========
const PROXY_ADDRESS = '0x342e808c40D8E00656fEd124CA11aEcBB96c61Fc' as const;
const ICONS_DIR = path.join(__dirname, '..', 'icons-64');
const MAX_GAS_PRICE_GWEI = parseFloat(process.env.MAX_GAS_PRICE_GWEI || '0.05');
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || '5');
const SKIP_EXISTING = process.env.SKIP_EXISTING !== 'false';
const RESUME_FROM = parseInt(process.env.RESUME_FROM || '0');
const OUTPUT_FILE = path.join(__dirname, '..', 'docs', 'mainnet-deployment-report.md');
const RPC_URL = process.env.RPC_URL || 'https://eth.drpc.org';

// Contract ABI (only what we need)
const ICON_REGISTRY_ABI = [
    {
        name: 'setIconsBatch',
        type: 'function',
        inputs: [
            { name: 'slugs', type: 'string[]' },
            { name: 'datas', type: 'bytes[]' },
            { name: 'widths', type: 'uint32[]' },
            { name: 'heights', type: 'uint32[]' },
        ],
        outputs: [],
    },
    {
        name: 'totalIcons',
        type: 'function',
        inputs: [],
        outputs: [{ type: 'uint256' }],
    },
    {
        name: 'getSlugsPaginated',
        type: 'function',
        inputs: [
            { name: 'offset', type: 'uint256' },
            { name: 'limit', type: 'uint256' },
        ],
        outputs: [{ type: 'bytes32[]' }],
    },
    {
        name: 'icons',
        type: 'function',
        inputs: [{ name: 'slugHash', type: 'bytes32' }],
        outputs: [
            { name: 'pointer', type: 'address' },
            { name: 'width', type: 'uint32' },
            { name: 'height', type: 'uint32' },
            { name: 'version', type: 'uint32' },
        ],
    },
] as const;

// ========== HELPERS ==========
function findAllPngs(dir: string): string[] {
    const results: string[] = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) results.push(...findAllPngs(fullPath));
        else if (entry.name.endsWith('.png')) results.push(fullPath);
    }
    return results;
}

function pathToSlug(filePath: string): string {
    return path.relative(ICONS_DIR, filePath).replace(/\.png$/, '').replace(/\\/g, '/');
}

function slugToHash(slug: string): `0x${string}` {
    const { keccak256, toHex } = require('viem');
    return keccak256(toHex(slug));
}

async function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ========== MAIN ==========
async function main() {
    console.log('=== IconRegistry Deployment with Turnkey ===\n');
    console.log(`Proxy: ${PROXY_ADDRESS}`);
    console.log(`Max gas price: ${MAX_GAS_PRICE_GWEI} gwei`);
    console.log(`Batch size: ${BATCH_SIZE}`);
    console.log(`RPC: ${RPC_URL}`);
    if (RESUME_FROM > 0) console.log(`Resuming from batch: ${RESUME_FROM}`);
    console.log('');

    // Initialize Turnkey signer
    console.log('Initializing Turnkey signer...');
    const { client: walletClient, address } = await createTurnkeySigner({ rpcUrl: RPC_URL });
    console.log(`Signer address: ${address}\n`);

    // Create public client for reads
    const publicClient = createPublicClient({
        chain: mainnet,
        transport: http(RPC_URL),
    });

    // Find all icons
    let pngs = findAllPngs(ICONS_DIR);
    console.log(`Found ${pngs.length.toLocaleString()} total icons`);

    // Filter out already uploaded icons
    if (SKIP_EXISTING) {
        console.log('Fetching already uploaded icons...');
        const total = await publicClient.readContract({
            address: PROXY_ADDRESS,
            abi: ICON_REGISTRY_ABI,
            functionName: 'totalIcons',
        });
        console.log(`Found ${total} icons on-chain`);

        const uploadedHashes = new Set<string>();
        const pageSize = 100n;
        
        for (let offset = 0n; offset < total; offset += pageSize) {
            const hashes = await publicClient.readContract({
                address: PROXY_ADDRESS,
                abi: ICON_REGISTRY_ABI,
                functionName: 'getSlugsPaginated',
                args: [offset, pageSize],
            });
            hashes.forEach(h => uploadedHashes.add(h.toLowerCase()));
        }

        const originalCount = pngs.length;
        pngs = pngs.filter(png => {
            const slug = pathToSlug(png);
            const hash = slugToHash(slug).toLowerCase();
            return !uploadedHashes.has(hash);
        });
        console.log(`Skipping ${originalCount - pngs.length} already uploaded`);
        console.log(`Remaining: ${pngs.length} icons to upload\n`);
    }

    if (pngs.length === 0) {
        console.log('All icons already uploaded!');
        return;
    }

    const totalBatches = Math.ceil(pngs.length / BATCH_SIZE);
    console.log(`Total batches: ${totalBatches}\n`);

    const reportData = {
        startTime: Date.now(),
        batches: [] as Array<{
            index: number;
            iconCount: number;
            gasUsed?: bigint;
            txHash?: string;
            success: boolean;
            note?: string;
        }>,
        successCount: 0,
        failCount: 0,
        totalGasUsed: 0n,
    };

    for (let batchNum = 0; batchNum < totalBatches; batchNum++) {
        if (batchNum < RESUME_FROM) continue;

        const startIdx = batchNum * BATCH_SIZE;
        const batch = pngs.slice(startIdx, startIdx + BATCH_SIZE);

        console.log(`\nPreparing batch ${batchNum + 1}/${totalBatches}...`);

        const slugs: string[] = [];
        const hexDatas: `0x${string}`[] = [];
        const widths: number[] = [];
        const heights: number[] = [];
        let batchBytes = 0;

        for (const png of batch) {
            const data = fs.readFileSync(png);
            slugs.push(pathToSlug(png));
            hexDatas.push(`0x${data.toString('hex')}`);
            widths.push(64);
            heights.push(64);
            batchBytes += data.length;
        }

        console.log(`Batch ready: ${batch.length} icons, ${(batchBytes / 1024).toFixed(1)} KB`);

        // Wait for acceptable gas price
        let gasPrice: bigint;
        const maxGasWei = parseGwei(MAX_GAS_PRICE_GWEI.toString());
        
        while (true) {
            gasPrice = await publicClient.getGasPrice();
            if (gasPrice <= maxGasWei) break;
            process.stdout.write(`\rGas: ${formatGwei(gasPrice)} gwei > ${MAX_GAS_PRICE_GWEI} gwei - waiting...    `);
            await sleep(6000);
        }
        console.log(`Gas price OK: ${formatGwei(gasPrice)} gwei`);

        // Add buffer to gas price
        const bufferedGasPrice = gasPrice + (gasPrice * 20n / 100n);

        try {
            // Encode function call
            const data = encodeFunctionData({
                abi: ICON_REGISTRY_ABI,
                functionName: 'setIconsBatch',
                args: [slugs, hexDatas, widths, heights],
            });

            // Estimate gas
            const gasEstimate = await publicClient.estimateGas({
                account: address,
                to: PROXY_ADDRESS,
                data,
            });

            // Get nonce
            const nonce = await publicClient.getTransactionCount({ address });

            // Send transaction via Turnkey
            const txHash = await walletClient.sendTransaction({
                to: PROXY_ADDRESS,
                data,
                gas: gasEstimate + (gasEstimate * 10n / 100n), // 10% buffer
                gasPrice: bufferedGasPrice,
                nonce,
            });

            console.log(`Tx sent: ${txHash}`);

            // Wait for receipt
            const receipt = await publicClient.waitForTransactionReceipt({
                hash: txHash,
                timeout: 180_000,
            });

            const gasUsed = receipt.gasUsed;
            reportData.totalGasUsed += gasUsed;
            reportData.successCount += batch.length;

            reportData.batches.push({
                index: batchNum + 1,
                iconCount: batch.length,
                gasUsed,
                txHash,
                success: true,
            });

            const progress = ((startIdx + batch.length) / pngs.length * 100).toFixed(1);
            console.log(`[${progress}%] Batch ${batchNum + 1}/${totalBatches}: ${batch.length} icons, ${gasUsed.toLocaleString()} gas`);

        } catch (err: any) {
            console.error(`\nBatch ${batchNum + 1} failed: ${err.message?.slice(0, 100)}`);
            
            reportData.failCount += batch.length;
            reportData.batches.push({
                index: batchNum + 1,
                iconCount: batch.length,
                success: false,
            });

            if (batchNum === RESUME_FROM) {
                console.error('First batch failed. Check your Turnkey configuration.');
                process.exit(1);
            }

            console.log(`Resume with: RESUME_FROM=${batchNum} tsx scripts/deploy-icons-turnkey.ts\n`);
        }

        await sleep(500);
    }

    // Summary
    const duration = ((Date.now() - reportData.startTime) / 1000 / 60).toFixed(1);
    const ethCost = Number(reportData.totalGasUsed) * MAX_GAS_PRICE_GWEI / 1e9;

    console.log('\n=== DEPLOYMENT COMPLETE ===');
    console.log(`Icons: ${reportData.successCount}/${pngs.length}`);
    console.log(`Failed: ${reportData.failCount}`);
    console.log(`Gas used: ${Number(reportData.totalGasUsed).toLocaleString()}`);
    console.log(`Est. cost: ${ethCost.toFixed(6)} ETH`);
    console.log(`Duration: ${duration} minutes`);

    // Save report
    const report = `# IconRegistry Mainnet Deployment Report

Generated: ${new Date().toISOString()}

## Summary

| Metric | Value |
|--------|-------|
| Network | Ethereum Mainnet |
| Proxy | \`${PROXY_ADDRESS}\` |
| Signer | \`${address}\` (Turnkey) |
| Total Icons | ${pngs.length.toLocaleString()} |
| Deployed | ${reportData.successCount.toLocaleString()} |
| Failed | ${reportData.failCount.toLocaleString()} |
| Total Gas | ${Number(reportData.totalGasUsed).toLocaleString()} |
| Duration | ${duration} minutes |

## Transactions

| Batch | Icons | Gas | Tx Hash |
|-------|-------|-----|---------|
${reportData.batches.map(b => 
    `| ${b.index} | ${b.iconCount} | ${b.success ? Number(b.gasUsed).toLocaleString() : 'FAILED'} | ${b.txHash ? `[\`${b.txHash.slice(0, 10)}...\`](https://etherscan.io/tx/${b.txHash})` : '-'} |`
).join('\n')}
`;

    fs.writeFileSync(OUTPUT_FILE, report);
    console.log(`\nReport saved: ${OUTPUT_FILE}`);
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
