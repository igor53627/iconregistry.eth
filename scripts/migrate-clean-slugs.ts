#!/usr/bin/env npx tsx
/**
 * Migrate Icons to Clean Slugs
 * 
 * Re-uploads existing icons with rsz prefix to clean slugs (without prefix).
 * The old icons remain on-chain (immutable), but new clean slugs are created.
 * 
 * Usage:
 *   DRY_RUN=true npx tsx scripts/migrate-clean-slugs.ts   # Preview changes
 *   npx tsx scripts/migrate-clean-slugs.ts                 # Deploy to mainnet
 * 
 * Options:
 *   DRY_RUN=true        - Preview without deploying
 *   BATCH_SIZE=20       - Icons per transaction (default: 20)
 *   MAX_GAS_PRICE_GWEI  - Max gas price to wait for (default: 0.05)
 *   RESUME_FROM=N       - Resume from batch N
 *   CATEGORY=chains     - Only migrate specific category (chains, protocols, assets)
 */

import { createPublicClient, http, encodeFunctionData, parseGwei, formatGwei, keccak256, toHex } from 'viem';
import { mainnet } from 'viem/chains';
import { createTurnkeySigner } from './turnkey-signer';
import * as fs from 'fs';
import * as path from 'path';

const PROXY_ADDRESS = '0x342e808c40D8E00656fEd124CA11aEcBB96c61Fc' as const;
const ICONS_DIR = path.join(__dirname, '..', 'icons-64');
const DRY_RUN = process.env.DRY_RUN === 'true';
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || '20');
const MAX_GAS_PRICE_GWEI = parseFloat(process.env.MAX_GAS_PRICE_GWEI || '0.05');
const RESUME_FROM = parseInt(process.env.RESUME_FROM || '0');
const CATEGORY = process.env.CATEGORY || '';
const RPC_URL = process.env.RPC_URL || 'https://eth.drpc.org';

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
        name: 'icons',
        type: 'function',
        inputs: [{ name: 'slugHash', type: 'bytes32' }],
        outputs: [
            { name: 'pointer', type: 'address' },
            { name: 'size', type: 'uint32' },
            { name: 'width', type: 'uint32' },
            { name: 'height', type: 'uint32' },
        ],
    },
] as const;

interface MigrationItem {
    oldSlug: string;
    newSlug: string;
    filePath: string;
}

function cleanSlug(slug: string): string {
    const parts = slug.split('/');
    if (parts.length !== 2) return slug;
    
    const [category, name] = parts;
    const cleanName = name
        .replace(/^rsz_?/i, '')
        .replace(/^rsz/i, '')
        .toLowerCase()
        .replace(/[_\s]+/g, '-')
        .replace(/[^a-z0-9-]/g, '')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
    
    return `${category}/${cleanName}`;
}

function findAllPngs(dir: string): string[] {
    const results: string[] = [];
    if (!fs.existsSync(dir)) return results;
    
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            results.push(...findAllPngs(fullPath));
        } else if (entry.name.endsWith('.png')) {
            results.push(fullPath);
        }
    }
    return results;
}

function pathToSlug(filePath: string): string {
    return path.relative(ICONS_DIR, filePath).replace(/\.png$/, '').replace(/\\/g, '/');
}

async function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
    console.log('=== Icon Slug Migration (rsz → clean) ===\n');
    console.log(`Mode: ${DRY_RUN ? 'DRY RUN (preview only)' : 'LIVE DEPLOYMENT'}`);
    console.log(`Batch size: ${BATCH_SIZE}`);
    console.log(`Max gas: ${MAX_GAS_PRICE_GWEI} gwei`);
    console.log(`RPC: ${RPC_URL}`);
    if (CATEGORY) console.log(`Category filter: ${CATEGORY}`);
    console.log('');

    const publicClient = createPublicClient({
        chain: mainnet,
        transport: http(RPC_URL),
    });

    // Find all local icons
    const pngs = findAllPngs(ICONS_DIR);
    console.log(`Found ${pngs.length} local icons`);

    // Build migration list: icons where current slug has rsz prefix
    const migrations: MigrationItem[] = [];

    for (const filePath of pngs) {
        const currentSlug = pathToSlug(filePath);
        
        // Filter by category if specified
        if (CATEGORY && !currentSlug.startsWith(CATEGORY + '/')) continue;
        
        const cleanedSlug = cleanSlug(currentSlug);
        
        // Only migrate if slug would change (has rsz prefix)
        if (currentSlug !== cleanedSlug) {
            // Check if clean slug already exists on-chain
            const cleanHash = keccak256(toHex(cleanedSlug));
            const existing = await publicClient.readContract({
                address: PROXY_ADDRESS,
                abi: ICON_REGISTRY_ABI,
                functionName: 'icons',
                args: [cleanHash],
            });

            if (existing[0] === '0x0000000000000000000000000000000000000000') {
                migrations.push({
                    oldSlug: currentSlug,
                    newSlug: cleanedSlug,
                    filePath,
                });
            }
        }
    }

    console.log(`Need to migrate: ${migrations.length} icons\n`);

    if (migrations.length === 0) {
        console.log('All icons already have clean slugs on-chain!');
        return;
    }

    // Show sample migrations
    console.log('Sample migrations:');
    migrations.slice(0, 10).forEach(m => {
        console.log(`  ${m.oldSlug} → ${m.newSlug}`);
    });
    if (migrations.length > 10) {
        console.log(`  ... and ${migrations.length - 10} more`);
    }
    console.log('');

    if (DRY_RUN) {
        // Estimate cost
        const avgBytesPerIcon = 2500; // ~2.5KB average
        const totalBytes = migrations.length * avgBytesPerIcon;
        const estimatedGasPerByte = 68; // SSTORE2 cost
        const totalGas = totalBytes * estimatedGasPerByte + migrations.length * 50000; // overhead per icon
        const ethCost = (totalGas * MAX_GAS_PRICE_GWEI) / 1e9;

        console.log('=== Cost Estimate ===');
        console.log(`Icons: ${migrations.length}`);
        console.log(`Est. gas: ${totalGas.toLocaleString()}`);
        console.log(`Est. cost: ~${ethCost.toFixed(4)} ETH at ${MAX_GAS_PRICE_GWEI} gwei`);
        console.log(`Batches: ${Math.ceil(migrations.length / BATCH_SIZE)}`);
        console.log('\nRun without DRY_RUN=true to deploy.');
        return;
    }

    // Initialize Turnkey signer
    console.log('Initializing Turnkey signer...');
    const { client: walletClient, address } = await createTurnkeySigner({ rpcUrl: RPC_URL });
    console.log(`Signer: ${address}\n`);

    const totalBatches = Math.ceil(migrations.length / BATCH_SIZE);
    let successCount = 0;
    let failCount = 0;
    let totalGasUsed = 0n;

    for (let batchNum = 0; batchNum < totalBatches; batchNum++) {
        if (batchNum < RESUME_FROM) continue;

        const startIdx = batchNum * BATCH_SIZE;
        const batch = migrations.slice(startIdx, startIdx + BATCH_SIZE);

        console.log(`\n[Batch ${batchNum + 1}/${totalBatches}] Preparing ${batch.length} icons...`);

        const slugs: string[] = [];
        const hexDatas: `0x${string}`[] = [];
        const widths: number[] = [];
        const heights: number[] = [];
        let batchBytes = 0;

        for (const item of batch) {
            const data = fs.readFileSync(item.filePath);
            slugs.push(item.newSlug);
            hexDatas.push(`0x${data.toString('hex')}`);
            widths.push(64);
            heights.push(64);
            batchBytes += data.length;
        }

        console.log(`Batch size: ${(batchBytes / 1024).toFixed(1)} KB`);

        // Wait for acceptable gas price
        const maxGasWei = parseGwei(MAX_GAS_PRICE_GWEI.toString());
        let gasPrice: bigint;

        while (true) {
            gasPrice = await publicClient.getGasPrice();
            if (gasPrice <= maxGasWei) break;
            process.stdout.write(`\rGas: ${formatGwei(gasPrice)} gwei > ${MAX_GAS_PRICE_GWEI} gwei - waiting...    `);
            await sleep(6000);
        }
        console.log(`Gas: ${formatGwei(gasPrice)} gwei ✓`);

        try {
            const data = encodeFunctionData({
                abi: ICON_REGISTRY_ABI,
                functionName: 'setIconsBatch',
                args: [slugs, hexDatas, widths, heights],
            });

            const gasEstimate = await publicClient.estimateGas({
                account: address,
                to: PROXY_ADDRESS,
                data,
            });

            const nonce = await publicClient.getTransactionCount({ address });
            const bufferedGasPrice = gasPrice + (gasPrice * 20n / 100n);

            const txHash = await walletClient.sendTransaction({
                to: PROXY_ADDRESS,
                data,
                gas: gasEstimate + (gasEstimate * 10n / 100n),
                gasPrice: bufferedGasPrice,
                nonce,
            });

            console.log(`Tx: ${txHash}`);

            const receipt = await publicClient.waitForTransactionReceipt({
                hash: txHash,
                timeout: 180_000,
            });

            totalGasUsed += receipt.gasUsed;
            successCount += batch.length;

            const progress = ((startIdx + batch.length) / migrations.length * 100).toFixed(1);
            console.log(`[${progress}%] ✓ ${batch.length} icons, ${receipt.gasUsed.toLocaleString()} gas`);

            // Log what was migrated
            batch.forEach(item => {
                console.log(`  ${item.oldSlug} → ${item.newSlug}`);
            });

        } catch (err: any) {
            console.error(`\n✗ Batch ${batchNum + 1} failed: ${err.message?.slice(0, 100)}`);
            failCount += batch.length;

            console.log(`Resume with: RESUME_FROM=${batchNum} npx tsx scripts/migrate-clean-slugs.ts\n`);
            
            if (batchNum === RESUME_FROM) {
                console.error('First batch failed. Check configuration.');
                process.exit(1);
            }
        }

        await sleep(500);
    }

    // Summary
    const ethCost = Number(totalGasUsed) * MAX_GAS_PRICE_GWEI / 1e9;

    console.log('\n=== Migration Complete ===');
    console.log(`Migrated: ${successCount}/${migrations.length}`);
    console.log(`Failed: ${failCount}`);
    console.log(`Gas used: ${Number(totalGasUsed).toLocaleString()}`);
    console.log(`Cost: ~${ethCost.toFixed(6)} ETH`);

    if (successCount > 0) {
        console.log('\nNext step: Update chain mappings to use clean slugs.');
        console.log('Run: npx tsx scripts/update-chain-mappings-clean.ts');
    }
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
