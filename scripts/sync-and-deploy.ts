#!/usr/bin/env npx tsx
/**
 * Sync icons from DefiLlama/icons and deploy new ones to mainnet
 * 
 * Steps:
 * 1. Clone/pull DefiLlama icons repo
 * 2. Find new icons not in our repo
 * 3. Process: resize 64x64 with sharp, optimize with oxipng
 * 4. Check gas price
 * 5. Deploy to mainnet via Turnkey
 * 
 * Usage:
 *   npx tsx scripts/sync-and-deploy.ts
 * 
 * Environment:
 *   MAX_GAS_PRICE_GWEI - Max gas price to deploy (default: 0.1)
 *   DRY_RUN - If "true", skip deployment (default: false)
 *   BATCH_SIZE - Icons per transaction (default: 5)
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import sharp from 'sharp';
import { createPublicClient, http, formatGwei, parseGwei, encodeFunctionData, keccak256, toHex } from 'viem';
import { mainnet } from 'viem/chains';

// Config
const DEFILLAMA_REPO = 'https://github.com/DefiLlama/icons.git';
const DEFILLAMA_DIR = '/tmp/defillama-icons';
const ICONS_DIR = path.join(__dirname, '..', 'icons-64');
const PROXY_ADDRESS = '0x342e808c40D8E00656fEd124CA11aEcBB96c61Fc' as const;
const MAX_GAS_PRICE_GWEI = parseFloat(process.env.MAX_GAS_PRICE_GWEI || '0.1');
const DRY_RUN = process.env.DRY_RUN === 'true';
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || '5');
const RPC_URL = process.env.RPC_URL || 'https://ethereum-rpc.publicnode.com';

const SUPPORTED_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.svg'];

// Skip junk files from DefiLlama repo
const SKIP_PATTERNS = [
    /_400x400\./i,           // Twitter profile pics
    / - Copy\./i,            // Windows copy artifacts
    /\.backup\./i,           // Backup files
    /\(1\)\./,               // Duplicate downloads
];

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
] as const;

// Helpers
function hasOxipng(): boolean {
    try {
        execSync('oxipng --version', { stdio: 'ignore' });
        return true;
    } catch {
        return false;
    }
}

function findAllIcons(dir: string, baseDir: string = dir): Array<{ fullPath: string; relativePath: string }> {
    const results: Array<{ fullPath: string; relativePath: string }> = [];
    if (!fs.existsSync(dir)) return results;
    
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            results.push(...findAllIcons(fullPath, baseDir));
        } else {
            const ext = path.extname(entry.name).toLowerCase();
            if (SUPPORTED_EXTENSIONS.includes(ext)) {
                // Skip junk files
                if (SKIP_PATTERNS.some(pattern => pattern.test(entry.name))) {
                    continue;
                }
                const relativePath = path.relative(baseDir, fullPath);
                results.push({ fullPath, relativePath });
            }
        }
    }
    return results;
}

function slugToHash(slug: string): `0x${string}` {
    return keccak256(toHex(slug));
}

async function processIcon(sourcePath: string, destPath: string, useOxipng: boolean): Promise<boolean> {
    const destDir = path.dirname(destPath);
    if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
    }
    
    try {
        // Step 1: sharp (resize 64x64, PNG level 9)
        await sharp(sourcePath)
            .resize(64, 64, {
                fit: 'contain',
                background: { r: 0, g: 0, b: 0, alpha: 0 }
            })
            .png({
                compressionLevel: 9,
                palette: true
            })
            .toFile(destPath);
        
        // Step 2: oxipng (-o max --strip all)
        if (useOxipng) {
            try {
                execSync(`oxipng -o max --strip all "${destPath}"`, { stdio: 'ignore' });
            } catch {
                // oxipng failure is non-fatal
            }
        }
        
        return true;
    } catch (err: any) {
        console.error(`Failed to process ${sourcePath}: ${err.message}`);
        return false;
    }
}

async function getOnChainSlugs(publicClient: any): Promise<Set<string>> {
    console.log('Fetching on-chain icons...');
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
        hashes.forEach((h: string) => uploadedHashes.add(h.toLowerCase()));
    }
    
    return uploadedHashes;
}

async function main() {
    console.log('=== DefiLlama Icon Sync & Deploy ===\n');
    console.log(`Max gas price: ${MAX_GAS_PRICE_GWEI} gwei`);
    console.log(`Dry run: ${DRY_RUN}`);
    console.log(`Batch size: ${BATCH_SIZE}\n`);

    // Step 1: Clone or pull DefiLlama icons
    console.log('Step 1: Syncing DefiLlama icons repo...');
    if (fs.existsSync(path.join(DEFILLAMA_DIR, '.git'))) {
        execSync('git pull --rebase origin HEAD || git pull origin HEAD', { 
            cwd: DEFILLAMA_DIR, 
            stdio: 'inherit' 
        });
    } else {
        if (fs.existsSync(DEFILLAMA_DIR)) {
            fs.rmSync(DEFILLAMA_DIR, { recursive: true });
        }
        execSync(`git clone --depth 1 ${DEFILLAMA_REPO} ${DEFILLAMA_DIR}`, { 
            stdio: 'inherit' 
        });
    }

    // Step 2: Find source icons
    console.log('\nStep 2: Finding source icons...');
    // Map DefiLlama source dirs to your local structure
    // Your on-chain slugs use: protocols/name, pegged/name, agg_icons/name, chains/name
    const sourceDirs = [
        { dir: path.join(DEFILLAMA_DIR, 'assets', 'protocols'), prefix: 'protocols' },
        { dir: path.join(DEFILLAMA_DIR, 'assets', 'pegged'), prefix: 'pegged' },
        { dir: path.join(DEFILLAMA_DIR, 'assets', 'agg_icons'), prefix: 'agg_icons' },
        { dir: path.join(DEFILLAMA_DIR, 'assets', 'chains'), prefix: 'chains' },
    ];

    const allSourceIcons: Array<{ fullPath: string; slug: string }> = [];
    for (const { dir, prefix } of sourceDirs) {
        const icons = findAllIcons(dir);
        for (const icon of icons) {
            const baseName = path.basename(icon.relativePath, path.extname(icon.relativePath));
            const subDir = path.dirname(icon.relativePath);
            // Normalize to lowercase to avoid case-sensitive duplicates
            const slug = (subDir === '.' 
                ? `${prefix}/${baseName}` 
                : `${prefix}/${subDir}/${baseName}`).toLowerCase();
            allSourceIcons.push({ fullPath: icon.fullPath, slug });
        }
    }
    console.log(`Found ${allSourceIcons.length} source icons`);

    // Step 3: Find existing local icons
    console.log('\nStep 3: Checking existing local icons...');
    const existingSlugs = new Set<string>();
    const existingFiles = findAllIcons(ICONS_DIR);
    for (const { relativePath } of existingFiles) {
        const slug = relativePath.replace(/\.png$/, '');
        existingSlugs.add(slug);
    }
    console.log(`Found ${existingSlugs.size} local icons`);

    // Step 4: Process new icons
    console.log('\nStep 4: Processing new icons...');
    const useOxipng = hasOxipng();
    console.log(`oxipng: ${useOxipng ? 'available' : 'not found'}`);

    const newIcons: Array<{ slug: string; path: string }> = [];
    let processed = 0;
    let failed = 0;

    for (const icon of allSourceIcons) {
        if (existingSlugs.has(icon.slug)) continue;

        const destPath = path.join(ICONS_DIR, icon.slug + '.png');
        const success = await processIcon(icon.fullPath, destPath, useOxipng);
        
        if (success) {
            newIcons.push({ slug: icon.slug, path: destPath });
            processed++;
            if (processed % 100 === 0) {
                console.log(`  Processed ${processed} new icons...`);
            }
        } else {
            failed++;
        }
    }

    console.log(`\nProcessed ${processed} new icons (${failed} failed)`);

    if (newIcons.length === 0) {
        console.log('\nNo new icons to deploy!');
        return;
    }

    // Step 5: Check against on-chain state
    console.log('\nStep 5: Checking on-chain state...');
    const publicClient = createPublicClient({
        chain: mainnet,
        transport: http(RPC_URL),
    });

    const onChainHashes = await getOnChainSlugs(publicClient);
    
    const toUpload = newIcons.filter(icon => {
        const hash = slugToHash(icon.slug).toLowerCase();
        return !onChainHashes.has(hash);
    });

    console.log(`${toUpload.length} icons need to be uploaded`);

    if (toUpload.length === 0) {
        console.log('\nAll new icons already on-chain!');
        return;
    }

    // Step 6: Check gas price
    console.log('\nStep 6: Checking gas price...');
    const gasPrice = await publicClient.getGasPrice();
    const gasPriceGwei = parseFloat(formatGwei(gasPrice));
    console.log(`Current gas price: ${gasPriceGwei.toFixed(4)} gwei`);

    if (gasPriceGwei > MAX_GAS_PRICE_GWEI) {
        console.log(`\nGas price too high (${gasPriceGwei.toFixed(4)} > ${MAX_GAS_PRICE_GWEI}). Skipping deployment.`);
        console.log('Icons have been processed and saved locally. They will be deployed when gas is lower.');
        
        // Output summary for GitHub Actions
        console.log('\n=== Summary ===');
        console.log(`New icons processed: ${processed}`);
        console.log(`Pending upload: ${toUpload.length}`);
        console.log(`Gas price: ${gasPriceGwei.toFixed(4)} gwei (max: ${MAX_GAS_PRICE_GWEI})`);
        return;
    }

    if (DRY_RUN) {
        console.log('\nDry run - skipping deployment');
        console.log(`Would deploy ${toUpload.length} icons in ${Math.ceil(toUpload.length / BATCH_SIZE)} batches`);
        return;
    }

    // Step 7: Deploy via Turnkey
    console.log('\nStep 7: Deploying via Turnkey...');
    
    // Import Turnkey signer dynamically to avoid errors if env vars not set
    const { createTurnkeySigner } = await import('./turnkey-signer');
    const { client: walletClient, address } = await createTurnkeySigner({ rpcUrl: RPC_URL });
    console.log(`Signer: ${address}`);

    const totalBatches = Math.ceil(toUpload.length / BATCH_SIZE);
    let successCount = 0;
    let totalGas = 0n;

    for (let i = 0; i < totalBatches; i++) {
        const batch = toUpload.slice(i * BATCH_SIZE, (i + 1) * BATCH_SIZE);
        
        const slugs = batch.map(b => b.slug);
        const datas = batch.map(b => `0x${fs.readFileSync(b.path).toString('hex')}` as `0x${string}`);
        const widths = batch.map(() => 64);
        const heights = batch.map(() => 64);

        try {
            const data = encodeFunctionData({
                abi: ICON_REGISTRY_ABI,
                functionName: 'setIconsBatch',
                args: [slugs, datas, widths, heights],
            });

            const gasEstimate = await publicClient.estimateGas({
                account: address,
                to: PROXY_ADDRESS,
                data,
            });

            const nonce = await publicClient.getTransactionCount({ address });
            const currentGasPrice = await publicClient.getGasPrice();
            const bufferedGasPrice = currentGasPrice + (currentGasPrice * 20n / 100n);

            const txHash = await walletClient.sendTransaction({
                to: PROXY_ADDRESS,
                data,
                gas: gasEstimate + (gasEstimate * 10n / 100n),
                gasPrice: bufferedGasPrice,
                nonce,
            });

            const receipt = await publicClient.waitForTransactionReceipt({
                hash: txHash,
                timeout: 180_000,
            });

            successCount += batch.length;
            totalGas += receipt.gasUsed;
            
            console.log(`Batch ${i + 1}/${totalBatches}: ${batch.length} icons, ${receipt.gasUsed.toLocaleString()} gas`);
        } catch (err: any) {
            console.error(`Batch ${i + 1} failed: ${err.message?.slice(0, 100)}`);
        }

        // Small delay between batches
        await new Promise(r => setTimeout(r, 500));
    }

    console.log('\n=== Deployment Complete ===');
    console.log(`Icons deployed: ${successCount}/${toUpload.length}`);
    console.log(`Total gas used: ${totalGas.toLocaleString()}`);
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
