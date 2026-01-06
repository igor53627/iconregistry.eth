#!/usr/bin/env tsx
/**
 * Sync SVG icons from web3icons
 * Fetches metadata and SVG files, sanitizes with SVGO, and prepares for on-chain upload
 * 
 * Usage: tsx scripts/sync-web3icons.ts [--dry-run] [--category=tokens|networks|wallets|exchanges]
 * 
 * Categories:
 *   tokens    - Token icons (2000+)
 *   networks  - Network/chain icons (100+)
 *   wallets   - Wallet icons (50+)
 *   exchanges - Exchange icons (50+)
 */

import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';

const WEB3ICONS_CDN = 'https://cdn.web3icons.io/v1';
const WEB3ICONS_METADATA = 'https://raw.githubusercontent.com/0xa3k5/web3icons/main/packages/core/src/metadata';
const OUTPUT_DIR = path.join(__dirname, '..', 'icons-svg');
const MANIFEST_FILE = path.join(__dirname, '..', 'web3icons-manifest.json');

const MAX_SVG_SIZE = 32768; // 32KB max for on-chain storage
const DEFAULT_VARIANT = 'branded'; // Use branded variant by default

interface TokenMetadata {
    id: string;
    name: string;
    symbol: string;
    addresses?: Record<string, string>;
    variants: string[];
}

interface NetworkMetadata {
    id: string;
    name: string;
    shortName?: string;
    chainId?: number;
    variants: string[];
}

interface WalletMetadata {
    id: string;
    name: string;
    variants: string[];
}

interface ExchangeMetadata {
    id: string;
    name: string;
    type: 'dex' | 'cex';
    variants: string[];
}

interface SyncManifest {
    lastSync: string;
    tokens: Record<string, { slug: string; size: number; variant: string }>;
    networks: Record<string, { slug: string; size: number; variant: string; chainId?: number }>;
    wallets: Record<string, { slug: string; size: number; variant: string }>;
    exchanges: Record<string, { slug: string; size: number; variant: string }>;
}

function fetchJson<T>(url: string): Promise<T> {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    reject(new Error(`Failed to parse JSON from ${url}: ${e}`));
                }
            });
        }).on('error', reject);
    });
}

function fetchSvg(url: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            const chunks: Buffer[] = [];
            res.on('data', chunk => chunks.push(chunk));
            res.on('end', () => resolve(Buffer.concat(chunks)));
        }).on('error', reject);
    });
}

function sanitizeSvg(svg: Buffer): Buffer {
    let content = svg.toString('utf-8');
    
    // Remove potentially dangerous elements and attributes
    // This is a basic sanitization - production should use SVGO
    content = content
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/on\w+="[^"]*"/gi, '')
        .replace(/on\w+='[^']*'/gi, '')
        .replace(/javascript:/gi, '')
        .replace(/<foreignObject[^>]*>[\s\S]*?<\/foreignObject>/gi, '');
    
    return Buffer.from(content, 'utf-8');
}

function ensureDir(dir: string) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

async function syncCategory<T extends { id: string; variants: string[] }>(
    category: string,
    metadataUrl: string,
    getSlug: (item: T) => string,
    getExtra: (item: T) => Record<string, unknown>,
    dryRun: boolean
): Promise<Record<string, { slug: string; size: number; variant: string } & Record<string, unknown>>> {
    console.log(`\n=== Syncing ${category} ===`);
    
    const metadata = await fetchJson<T[]>(metadataUrl);
    console.log(`Found ${metadata.length} ${category}`);
    
    const results: Record<string, { slug: string; size: number; variant: string } & Record<string, unknown>> = {};
    const categoryDir = path.join(OUTPUT_DIR, category);
    ensureDir(categoryDir);
    
    let processed = 0;
    let skipped = 0;
    let failed = 0;
    
    for (const item of metadata) {
        const variant = item.variants.includes(DEFAULT_VARIANT) ? DEFAULT_VARIANT : item.variants[0];
        if (!variant) {
            console.log(`  Skip ${item.id}: no variants available`);
            skipped++;
            continue;
        }
        
        const slug = getSlug(item);
        const svgUrl = `${WEB3ICONS_CDN}/${category}/${variant}/${item.id}.svg`;
        const outputPath = path.join(categoryDir, `${item.id}.svg`);
        
        try {
            if (dryRun) {
                console.log(`  Would fetch: ${slug}`);
                processed++;
                continue;
            }
            
            const svg = await fetchSvg(svgUrl);
            
            if (svg.length > MAX_SVG_SIZE) {
                console.log(`  Skip ${item.id}: SVG too large (${svg.length} bytes > ${MAX_SVG_SIZE})`);
                skipped++;
                continue;
            }
            
            const sanitized = sanitizeSvg(svg);
            fs.writeFileSync(outputPath, sanitized);
            
            results[item.id] = {
                slug,
                size: sanitized.length,
                variant,
                ...getExtra(item)
            };
            
            processed++;
            if (processed % 100 === 0) {
                console.log(`  Processed ${processed}/${metadata.length}...`);
            }
        } catch (err) {
            console.log(`  Failed ${item.id}: ${err}`);
            failed++;
        }
    }
    
    console.log(`${category}: ${processed} processed, ${skipped} skipped, ${failed} failed`);
    return results;
}

async function main() {
    const args = process.argv.slice(2);
    const dryRun = args.includes('--dry-run');
    const categoryArg = args.find(a => a.startsWith('--category='));
    const selectedCategory = categoryArg?.split('=')[1];
    
    console.log('=== Web3Icons Sync ===');
    console.log(`Output: ${OUTPUT_DIR}`);
    if (dryRun) console.log('Mode: DRY RUN');
    if (selectedCategory) console.log(`Category: ${selectedCategory}`);
    
    ensureDir(OUTPUT_DIR);
    
    const manifest: SyncManifest = {
        lastSync: new Date().toISOString(),
        tokens: {},
        networks: {},
        wallets: {},
        exchanges: {}
    };
    
    // Sync tokens
    if (!selectedCategory || selectedCategory === 'tokens') {
        manifest.tokens = await syncCategory<TokenMetadata>(
            'tokens',
            `${WEB3ICONS_METADATA}/tokens.json`,
            (t) => `tokens/${t.id}`,
            (t) => ({ symbol: t.symbol, addresses: t.addresses }),
            dryRun
        );
    }
    
    // Sync networks
    if (!selectedCategory || selectedCategory === 'networks') {
        manifest.networks = await syncCategory<NetworkMetadata>(
            'networks',
            `${WEB3ICONS_METADATA}/networks.json`,
            (n) => `networks/${n.id}`,
            (n) => ({ chainId: n.chainId }),
            dryRun
        ) as SyncManifest['networks'];
    }
    
    // Sync wallets
    if (!selectedCategory || selectedCategory === 'wallets') {
        manifest.wallets = await syncCategory<WalletMetadata>(
            'wallets',
            `${WEB3ICONS_METADATA}/wallets.json`,
            (w) => `wallets/${w.id}`,
            () => ({}),
            dryRun
        );
    }
    
    // Sync exchanges
    if (!selectedCategory || selectedCategory === 'exchanges') {
        manifest.exchanges = await syncCategory<ExchangeMetadata>(
            'exchanges',
            `${WEB3ICONS_METADATA}/exchanges.json`,
            (e) => `exchanges/${e.id}`,
            (e) => ({ type: e.type }),
            dryRun
        );
    }
    
    // Save manifest
    if (!dryRun) {
        fs.writeFileSync(MANIFEST_FILE, JSON.stringify(manifest, null, 2));
        console.log(`\nManifest saved to ${MANIFEST_FILE}`);
    }
    
    // Summary
    const totalIcons = 
        Object.keys(manifest.tokens).length +
        Object.keys(manifest.networks).length +
        Object.keys(manifest.wallets).length +
        Object.keys(manifest.exchanges).length;
    
    console.log('\n=== Summary ===');
    console.log(`Tokens: ${Object.keys(manifest.tokens).length}`);
    console.log(`Networks: ${Object.keys(manifest.networks).length}`);
    console.log(`Wallets: ${Object.keys(manifest.wallets).length}`);
    console.log(`Exchanges: ${Object.keys(manifest.exchanges).length}`);
    console.log(`Total: ${totalIcons}`);
    
    if (!dryRun && totalIcons > 0) {
        console.log('\nSVGs saved to icons-svg/. Use deploy-svg-icons.ts to upload to contract.');
    }
}

main().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});
