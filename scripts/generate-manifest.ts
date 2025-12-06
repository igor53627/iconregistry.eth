#!/usr/bin/env npx tsx
/**
 * Generate Icon Manifest
 * 
 * Creates a comprehensive manifest of all on-chain icons with metadata
 * for discovery and heuristic matching.
 * 
 * Usage:
 *   npx tsx scripts/generate-manifest.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { createPublicClient, http, keccak256, toHex } from 'viem';
import { mainnet } from 'viem/chains';

const PROXY_ADDRESS = '0x342e808c40D8E00656fEd124CA11aEcBB96c61Fc' as const;
const ICONS_DIR = path.join(__dirname, '..', 'icons-64');
const OUTPUT_FILE = path.join(__dirname, '..', 'docs', 'manifest.json');
const INDEX_FILE = path.join(__dirname, '..', 'docs', 'manifest-index.json');
const RPC_URL = process.env.RPC_URL || 'https://eth.drpc.org';

// Load existing mappings
const CHAIN_MAPPINGS_FILE = path.join(__dirname, '..', 'docs', 'chain-mappings.json');
const TOKEN_MAPPINGS_FILE = path.join(__dirname, '..', 'docs', 'token-mappings.json');

interface IconEntry {
    slug: string;
    slugHash: string;
    category: string;
    name: string;
    keywords: string[];
    chainMappings?: number[];
    tokenMappings?: Array<{ address: string; chainId: number }>;
}

function slugToName(slug: string): string {
    const parts = slug.split('/');
    const name = parts[parts.length - 1];
    return name
        .replace(/^rsz[-_]?/i, '')
        .replace(/[-_]/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase())
        .trim();
}

function cleanSlug(slug: string): string {
    const parts = slug.split('/');
    if (parts.length !== 2) return slug;
    
    const [category, name] = parts;
    const cleanName = name
        .replace(/^rsz[-_]?/i, '')
        .replace(/^rsz/i, '')
        .toLowerCase()
        .replace(/[_\s]+/g, '-')
        .replace(/[^a-z0-9-]/g, '')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
    
    return `${category}/${cleanName}`;
}

function generateKeywords(slug: string, name: string): string[] {
    const keywords = new Set<string>();
    
    // Add slug parts
    const slugName = slug.split('/').pop() || '';
    keywords.add(slugName.toLowerCase());
    
    // Add name variations
    keywords.add(name.toLowerCase());
    
    // Add without common prefixes
    const cleanName = slugName
        .replace(/^rsz[-_]?/i, '')
        .replace(/[-_]/g, '')
        .toLowerCase();
    keywords.add(cleanName);
    
    // Add hyphenated version
    keywords.add(slugName.replace(/[-_]/g, '-').toLowerCase());
    
    // Add with spaces
    keywords.add(slugName.replace(/[-_]/g, ' ').toLowerCase());
    
    // Add acronym (first letter of each word)
    const words = name.split(/\s+/);
    if (words.length > 1) {
        keywords.add(words.map(w => w[0]).join('').toLowerCase());
    }
    
    return [...keywords].filter(k => k.length > 0);
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

async function main() {
    console.log('=== Generating Icon Manifest ===\n');

    const publicClient = createPublicClient({
        chain: mainnet,
        transport: http(RPC_URL),
    });

    // Load existing mappings
    let chainMappings: Array<{ chainId: number; slug: string }> = [];
    let tokenMappings: Array<{ token: string; chainId: number; slug: string; name: string; symbol: string }> = [];

    if (fs.existsSync(CHAIN_MAPPINGS_FILE)) {
        const data = JSON.parse(fs.readFileSync(CHAIN_MAPPINGS_FILE, 'utf-8'));
        chainMappings = data.mappings.map((m: any) => ({ chainId: m.chainId, slug: m.slug }));
        console.log(`Loaded ${chainMappings.length} chain mappings`);
    }

    if (fs.existsSync(TOKEN_MAPPINGS_FILE)) {
        const data = JSON.parse(fs.readFileSync(TOKEN_MAPPINGS_FILE, 'utf-8'));
        tokenMappings = data.mappings;
        console.log(`Loaded ${tokenMappings.length} token mappings`);
    }

    // Build lookup maps
    const chainsBySlug = new Map<string, number[]>();
    for (const m of chainMappings) {
        const existing = chainsBySlug.get(m.slug) || [];
        existing.push(m.chainId);
        chainsBySlug.set(m.slug, existing);
    }

    const tokensBySlug = new Map<string, Array<{ address: string; chainId: number }>>();
    for (const m of tokenMappings) {
        const existing = tokensBySlug.get(m.slug) || [];
        existing.push({ address: m.token, chainId: m.chainId });
        tokensBySlug.set(m.slug, existing);
    }

    // Find all local icons
    const pngs = findAllPngs(ICONS_DIR);
    console.log(`Found ${pngs.length} local icons\n`);

    // Build manifest entries
    const entries: IconEntry[] = [];
    const categories = new Map<string, number>();

    for (const filePath of pngs) {
        const slug = pathToSlug(filePath);
        const category = slug.split('/')[0];
        const name = slugToName(slug);
        const slugHash = keccak256(toHex(slug));
        const keywords = generateKeywords(slug, name);

        categories.set(category, (categories.get(category) || 0) + 1);

        const entry: IconEntry = {
            slug,
            slugHash,
            category,
            name,
            keywords,
        };

        // Add chain mappings if exist (check both raw and clean slug)
        const cleanedSlug = cleanSlug(slug);
        const chains = chainsBySlug.get(slug) || chainsBySlug.get(cleanedSlug);
        if (chains && chains.length > 0) {
            entry.chainMappings = chains;
        }

        // Add token mappings if exist (check both raw and clean slug)
        const tokens = tokensBySlug.get(slug) || tokensBySlug.get(cleanedSlug);
        if (tokens && tokens.length > 0) {
            entry.tokenMappings = tokens;
        }

        entries.push(entry);
    }

    // Sort by category then slug
    entries.sort((a, b) => {
        if (a.category !== b.category) return a.category.localeCompare(b.category);
        return a.slug.localeCompare(b.slug);
    });

    // Build stats
    const stats = {
        total: entries.length,
        byCategory: Object.fromEntries(categories),
        mapped: {
            chains: entries.filter(e => e.chainMappings).length,
            tokens: entries.filter(e => e.tokenMappings).length,
            total: entries.filter(e => e.chainMappings || e.tokenMappings).length,
        },
        unmapped: entries.length - entries.filter(e => e.chainMappings || e.tokenMappings).length,
    };

    // Generate manifest
    const manifest = {
        version: '1.0.0',
        generatedAt: new Date().toISOString(),
        contract: PROXY_ADDRESS,
        network: 'mainnet',
        description: 'Comprehensive index of all IconRegistry icons for discovery and heuristic matching',
        stats,
        usage: {
            bySlug: 'registry.getIconBySlug(slug)',
            bySlugHash: 'registry.getIcon(keccak256(slug))',
            byChainId: 'registry.getChainIcon(chainId)',
            byToken: 'registry.getIconByToken(address, chainId)',
        },
        heuristics: {
            description: 'Use keywords array for fuzzy matching. Keywords include slug variations, name parts, and acronyms.',
            example: 'To find Uniswap: search keywords for "uniswap", "uni", or check if slug contains the term.',
        },
        icons: entries,
    };

    // Write manifest
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(manifest, null, 2) + '\n');

    // Generate lightweight index with actual on-chain slugs
    const index = {
        version: manifest.version,
        generatedAt: manifest.generatedAt,
        contract: manifest.contract,
        network: manifest.network,
        stats: manifest.stats,
        usage: manifest.usage,
        chainIdToSlug: Object.fromEntries(chainMappings.map(m => [m.chainId, m.slug])),
        tokenToSlug: Object.fromEntries(tokenMappings.map(m => [`${m.chainId}:${m.token}`, m.slug])),
        slugsByCategory: {
            chains: entries.filter(e => e.category === 'chains').map(e => e.slug),
            protocols: entries.filter(e => e.category === 'protocols').map(e => e.slug),
            pegged: entries.filter(e => e.category === 'pegged').map(e => e.slug),
            agg_icons: entries.filter(e => e.category === 'agg_icons').map(e => e.slug),
        },
    };
    fs.writeFileSync(INDEX_FILE, JSON.stringify(index, null, 2) + '\n');
    
    console.log('=== Manifest Generated ===');
    console.log(`Total icons: ${stats.total}`);
    console.log(`By category: ${JSON.stringify(stats.byCategory)}`);
    console.log(`Mapped (chains): ${stats.mapped.chains}`);
    console.log(`Mapped (tokens): ${stats.mapped.tokens}`);
    console.log(`Unmapped: ${stats.unmapped}`);
    console.log(`\nWritten to: ${OUTPUT_FILE}`);
    console.log(`Index written to: ${INDEX_FILE}`);
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
