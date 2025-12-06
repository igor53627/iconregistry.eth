#!/usr/bin/env npx tsx
/**
 * Set up tokenToIcon mappings on IconRegistry
 * 
 * This script maps token addresses to their corresponding icon slugs so users
 * can look up token icons by address instead of knowing the exact slug.
 * 
 * Usage:
 *   DRY_RUN=true npx tsx scripts/setup-token-mappings.ts   # Preview only
 *   npx tsx scripts/setup-token-mappings.ts                 # Deploy mappings
 * 
 * Options:
 *   DRY_RUN=true         - Preview without deploying
 *   BATCH_SIZE=100       - Mappings per transaction (default: 100)
 *   MAX_GAS_PRICE_GWEI   - Max gas price to wait for (default: 0.05)
 *   RESUME_FROM=N        - Resume from batch N
 */

import * as fs from 'fs';
import * as path from 'path';
import { createPublicClient, http, encodeFunctionData, formatGwei, parseGwei, keccak256, toHex } from 'viem';
import { mainnet } from 'viem/chains';
import { createTurnkeySigner } from './turnkey-signer';

const PROXY_ADDRESS = '0x342e808c40D8E00656fEd124CA11aEcBB96c61Fc' as const;
const RPC_URL = process.env.RPC_URL || 'https://ethereum-rpc.publicnode.com';
const FALLBACK_RPC_URL = 'https://eth.drpc.org';
const DRY_RUN = process.env.DRY_RUN === 'true';
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || '100');
const MAX_GAS_PRICE_GWEI = parseFloat(process.env.MAX_GAS_PRICE_GWEI || '0.05');
const RESUME_FROM = parseInt(process.env.RESUME_FROM || '0');

const MAPPINGS_FILE = path.join(__dirname, '..', 'docs', 'token-mappings.json');

const ICON_REGISTRY_ABI = [
    {
        name: 'mapTokensBatch',
        type: 'function',
        inputs: [
            { name: 'tokens', type: 'address[]' },
            { name: 'chainIds', type: 'uint256[]' },
            { name: 'slugList', type: 'string[]' },
        ],
        outputs: [],
    },
    {
        name: 'tokenToIcon',
        type: 'function',
        inputs: [
            { name: 'token', type: 'address' },
            { name: 'chainId', type: 'uint256' },
        ],
        outputs: [{ type: 'bytes32' }],
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

interface TokenMapping {
    token: string;
    chainId: number;
    slug: string;
    name: string;
    symbol: string;
}

async function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function createRpcClient(primary: string, fallback: string) {
    const { fallback: viemFallback } = await import('viem');
    return createPublicClient({
        chain: mainnet,
        transport: viemFallback([http(primary), http(fallback)]),
    });
}

async function main() {
    console.log('=== IconRegistry Token Mapping Setup ===\n');
    console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE DEPLOYMENT'}`);
    console.log(`Batch size: ${BATCH_SIZE}`);
    console.log(`Max gas: ${MAX_GAS_PRICE_GWEI} gwei`);
    console.log(`RPC: ${RPC_URL} (fallback: ${FALLBACK_RPC_URL})\n`);

    // Load mappings
    if (!fs.existsSync(MAPPINGS_FILE)) {
        console.error(`Mappings file not found: ${MAPPINGS_FILE}`);
        console.error('Run: npx tsx scripts/sync-token-mappings.ts first');
        process.exit(1);
    }

    const data = JSON.parse(fs.readFileSync(MAPPINGS_FILE, 'utf-8'));
    const allMappings: TokenMapping[] = data.mappings;
    console.log(`Loaded ${allMappings.length} mappings from ${MAPPINGS_FILE}\n`);

    const publicClient = await createRpcClient(RPC_URL, FALLBACK_RPC_URL);

    // Check which slugs exist on-chain and which mappings are already set
    console.log('Checking on-chain state...');
    const toSet: TokenMapping[] = [];
    const missingIcons: string[] = [];

    for (const mapping of allMappings) {
        // Check if slug exists
        const slugHash = keccak256(toHex(mapping.slug));
        let iconExists = false;
        
        try {
            const iconData = await publicClient.readContract({
                address: PROXY_ADDRESS,
                abi: ICON_REGISTRY_ABI,
                functionName: 'icons',
                args: [slugHash],
            });
            iconExists = iconData[0] !== '0x0000000000000000000000000000000000000000';
        } catch {
            iconExists = false;
        }

        if (!iconExists) {
            if (!missingIcons.includes(mapping.slug)) {
                missingIcons.push(mapping.slug);
            }
            continue;
        }

        // Check if mapping already exists
        try {
            const existing = await publicClient.readContract({
                address: PROXY_ADDRESS,
                abi: ICON_REGISTRY_ABI,
                functionName: 'tokenToIcon',
                args: [mapping.token as `0x${string}`, BigInt(mapping.chainId)],
            });

            // If mapping exists but points to different slug, update it
            if (existing.toLowerCase() !== slugHash.toLowerCase()) {
                toSet.push(mapping);
            }
        } catch {
            // Mapping doesn't exist yet, add it
            toSet.push(mapping);
        }
    }

    console.log(`Already set: ${allMappings.length - toSet.length - missingIcons.length}`);
    console.log(`Need to set: ${toSet.length}`);
    console.log(`Missing icons: ${missingIcons.length}`);
    if (missingIcons.length > 0) {
        console.log('  Missing:', missingIcons.slice(0, 5).join(', '), 
            missingIcons.length > 5 ? `... +${missingIcons.length - 5} more` : '');
    }
    console.log('');

    if (toSet.length === 0) {
        console.log('All token mappings already set!');
        return;
    }

    // Show sample mappings
    console.log('Sample mappings to set:');
    toSet.slice(0, 10).forEach(m => {
        console.log(`  ${m.token} (chain ${m.chainId}) => ${m.slug} (${m.symbol})`);
    });
    if (toSet.length > 10) {
        console.log(`  ... and ${toSet.length - 10} more`);
    }
    console.log('');

    if (DRY_RUN) {
        // Estimate cost
        const gasPerMapping = 45000; // ~45k gas per mapping
        const totalGas = toSet.length * gasPerMapping;
        const ethCost = (totalGas * MAX_GAS_PRICE_GWEI) / 1e9;
        const numBatches = Math.ceil(toSet.length / BATCH_SIZE);

        console.log('=== Cost Estimate ===');
        console.log(`Mappings: ${toSet.length}`);
        console.log(`Batches: ${numBatches}`);
        console.log(`Est. gas: ${totalGas.toLocaleString()}`);
        console.log(`Est. cost: ~${ethCost.toFixed(6)} ETH at ${MAX_GAS_PRICE_GWEI} gwei`);
        console.log('\nRun without DRY_RUN=true to deploy.');
        return;
    }

    // Initialize Turnkey signer
    console.log('Initializing Turnkey signer...');
    const { client: walletClient, address } = await createTurnkeySigner({ rpcUrl: RPC_URL });
    console.log(`Signer: ${address}\n`);

    const totalBatches = Math.ceil(toSet.length / BATCH_SIZE);
    let successCount = 0;
    let failCount = 0;
    let totalGasUsed = 0n;

    for (let batchNum = 0; batchNum < totalBatches; batchNum++) {
        if (batchNum < RESUME_FROM) continue;

        const startIdx = batchNum * BATCH_SIZE;
        const batch = toSet.slice(startIdx, startIdx + BATCH_SIZE);

        console.log(`\n[Batch ${batchNum + 1}/${totalBatches}] Preparing ${batch.length} mappings...`);

        const tokens = batch.map(m => m.token as `0x${string}`);
        const chainIds = batch.map(m => BigInt(m.chainId));
        const slugs = batch.map(m => m.slug);

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
                functionName: 'mapTokensBatch',
                args: [tokens, chainIds, slugs],
            });

            const gasEstimate = await publicClient.estimateGas({
                account: address,
                to: PROXY_ADDRESS,
                data,
            });

            const nonce = await publicClient.getTransactionCount({ address });
            const bufferedGasPrice = gasPrice + (gasPrice * 10n / 100n);

            const txHash = await walletClient.sendTransaction({
                to: PROXY_ADDRESS,
                data,
                gas: gasEstimate + (gasEstimate * 20n / 100n),
                gasPrice: bufferedGasPrice,
                nonce,
            });

            console.log(`Tx: ${txHash}`);

            const receipt = await publicClient.waitForTransactionReceipt({
                hash: txHash,
                timeout: 300_000,
            });

            totalGasUsed += receipt.gasUsed;
            successCount += batch.length;

            const progress = ((startIdx + batch.length) / toSet.length * 100).toFixed(1);
            console.log(`[${progress}%] ✓ ${batch.length} mappings, ${receipt.gasUsed.toLocaleString()} gas`);

        } catch (err: any) {
            console.error(`\n✗ Batch ${batchNum + 1} failed: ${err.message?.slice(0, 100)}`);
            failCount += batch.length;
            console.log(`Resume with: RESUME_FROM=${batchNum} npx tsx scripts/setup-token-mappings.ts\n`);
        }

        await sleep(500);
    }

    // Summary
    const ethCost = Number(totalGasUsed) * MAX_GAS_PRICE_GWEI / 1e9;

    console.log('\n=== Complete ===');
    console.log(`Mapped: ${successCount}/${toSet.length}`);
    console.log(`Failed: ${failCount}`);
    console.log(`Gas used: ${Number(totalGasUsed).toLocaleString()}`);
    console.log(`Cost: ~${ethCost.toFixed(6)} ETH`);
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
