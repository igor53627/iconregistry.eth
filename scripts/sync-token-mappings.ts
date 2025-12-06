#!/usr/bin/env npx tsx
/**
 * Sync Token Mappings from DefiLlama
 * 
 * Fetches stablecoin data from DefiLlama and generates token mappings JSON.
 * Maps token addresses to pegged/ icon slugs.
 * 
 * Usage:
 *   npx tsx scripts/sync-token-mappings.ts
 */

import * as fs from 'fs';
import * as path from 'path';

const ICONS_DIR = path.join(__dirname, '..', 'icons-64');
const OUTPUT_FILE = path.join(__dirname, '..', 'docs', 'token-mappings.json');

// Chain name to chain ID mapping (from DefiLlama)
const CHAIN_NAME_TO_ID: Record<string, number> = {
    'Ethereum': 1,
    'Optimism': 10,
    'Cronos': 25,
    'BSC': 56,
    'Gnosis': 100,
    'Polygon': 137,
    'Fantom': 250,
    'Kroma': 255,
    'Boba': 288,
    'Filecoin': 314,
    'PulseChain': 369,
    'Astar': 592,
    'Metis': 1088,
    'Polygon zkEVM': 1101,
    'Core': 1116,
    'Moonbeam': 1284,
    'Moonriver': 1285,
    'Sei': 1329,
    'Mantle': 5000,
    'ZetaChain': 7000,
    'Canto': 7700,
    'Klaytn': 8217,
    'Base': 8453,
    'Evmos': 9001,
    'Mode': 34443,
    'Arbitrum': 42161,
    'Avalanche': 43114,
    'Celo': 42220,
    'Linea': 59144,
    'Blast': 81457,
    'Scroll': 534352,
    'zkSync Era': 324,
    'Aurora': 1313161554,
    'Harmony': 1666600000,
    'Tron': 728126428,
    'Manta': 169,
    'opBNB': 204,
    'Taiko': 167000,
    'Bitlayer': 200901,
    'Zircuit': 48900,
    'BOB': 60808,
    'Berachain': 80094,
    'Sonic': 146,
    'Unichain': 130,
    'Abstract': 2741,
    'Ink': 57073,
    'Hyperliquid L1': 999,
    'Fraxtal': 252,
    'Lisk': 1135,
    'Rootstock': 30,
    'Kava': 2222,
    'Velas': 106,
    'ThunderCore': 108,
    'Fuse': 122,
    'HECO': 128,
    'Telos': 40,
    'Oasys': 248,
    'IoTeX': 4689,
    'Dogechain': 2000,
    'Ronin': 2020,
    'smartBCH': 10000,
    'OKX Chain': 66,
    'Heco': 128,
};

interface StablecoinSummary {
    id: string;
    name: string;
    symbol: string;
    gecko_id: string | null;
    chains: string[];
}

interface StablecoinDetail {
    id: string;
    name: string;
    symbol: string;
    address: string;
    gecko_id: string | null;
    chainBalances: Record<string, any>;
}

interface TokenMapping {
    token: string;
    chainId: number;
    slug: string;
    name: string;
    symbol: string;
}

function slugify(name: string): string {
    return name
        .toLowerCase()
        .replace(/['']/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
}

function findIconSlug(name: string, symbol: string): string | null {
    const peggedDir = path.join(ICONS_DIR, 'pegged');
    if (!fs.existsSync(peggedDir)) return null;

    const files = fs.readdirSync(peggedDir);
    const slugified = slugify(name);
    
    // Try exact match first
    if (files.includes(`${slugified}.png`)) {
        return `pegged/${slugified}`;
    }

    // Try symbol-based match
    const symbolLower = symbol.toLowerCase();
    const symbolMatch = files.find(f => 
        f.toLowerCase() === `${symbolLower}.png` ||
        f.toLowerCase().startsWith(`${symbolLower}-`) ||
        f.toLowerCase().includes(symbolLower)
    );
    if (symbolMatch) {
        return `pegged/${symbolMatch.replace('.png', '')}`;
    }

    // Try partial name match
    const partialMatch = files.find(f => 
        f.toLowerCase().includes(slugified) ||
        slugified.includes(f.replace('.png', '').toLowerCase())
    );
    if (partialMatch) {
        return `pegged/${partialMatch.replace('.png', '')}`;
    }

    return null;
}

async function fetchWithRetry(url: string, retries = 3): Promise<any> {
    for (let i = 0; i < retries; i++) {
        try {
            const res = await fetch(url);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return await res.json();
        } catch (err) {
            if (i === retries - 1) throw err;
            await new Promise(r => setTimeout(r, 1000 * (i + 1)));
        }
    }
}

async function main() {
    console.log('=== Sync Token Mappings from DefiLlama ===\n');

    // Fetch stablecoin list
    console.log('Fetching stablecoin list...');
    const list = await fetchWithRetry('https://stablecoins.llama.fi/stablecoins?includePrices=false');
    const stablecoins: StablecoinSummary[] = list.peggedAssets || [];
    console.log(`Found ${stablecoins.length} stablecoins\n`);

    // Get available pegged icons
    const peggedDir = path.join(ICONS_DIR, 'pegged');
    const availableIcons = fs.existsSync(peggedDir) 
        ? fs.readdirSync(peggedDir).filter(f => f.endsWith('.png'))
        : [];
    console.log(`Available pegged icons: ${availableIcons.length}\n`);

    const mappings: TokenMapping[] = [];
    const notFound: string[] = [];
    const noAddress: string[] = [];

    // Process top stablecoins (by number of chains, as proxy for importance)
    const sortedStablecoins = stablecoins
        .filter(s => s.chains && s.chains.length > 0)
        .sort((a, b) => b.chains.length - a.chains.length);

    console.log('Processing stablecoins...');
    let processed = 0;

    for (const stablecoin of sortedStablecoins.slice(0, 100)) { // Top 100
        const slug = findIconSlug(stablecoin.name, stablecoin.symbol);
        if (!slug) {
            notFound.push(`${stablecoin.name} (${stablecoin.symbol})`);
            continue;
        }

        // Fetch detail for addresses
        try {
            const detail: StablecoinDetail = await fetchWithRetry(
                `https://stablecoins.llama.fi/stablecoin/${stablecoin.id}`
            );

            // Primary address (usually Ethereum)
            if (detail.address && detail.address.startsWith('0x')) {
                mappings.push({
                    token: detail.address.toLowerCase(),
                    chainId: 1,
                    slug,
                    name: stablecoin.name,
                    symbol: stablecoin.symbol,
                });
            }

            // Check chainBalances for other chain addresses
            if (detail.chainBalances) {
                for (const [chainName, chainData] of Object.entries(detail.chainBalances)) {
                    const chainId = CHAIN_NAME_TO_ID[chainName];
                    if (!chainId || chainId === 1) continue;

                    // chainData might have tokens array with addresses
                    const tokens = (chainData as any)?.tokens;
                    if (tokens && Array.isArray(tokens) && tokens.length > 0) {
                        const lastToken = tokens[tokens.length - 1];
                        if (lastToken?.circulating) {
                            // Extract address if present
                            // DefiLlama doesn't always expose per-chain addresses in this endpoint
                        }
                    }
                }
            }

            processed++;
            if (processed % 10 === 0) {
                process.stdout.write(`\rProcessed ${processed}/${sortedStablecoins.slice(0, 100).length}`);
            }

            // Rate limit
            await new Promise(r => setTimeout(r, 100));
        } catch (err) {
            console.error(`\nFailed to fetch ${stablecoin.name}: ${err}`);
        }
    }

    console.log(`\n\nGenerated ${mappings.length} mappings`);
    console.log(`Icons not found for: ${notFound.length} stablecoins`);
    if (notFound.length > 0) {
        console.log('Missing icons:', notFound.slice(0, 10).join(', '), 
            notFound.length > 10 ? `... +${notFound.length - 10} more` : '');
    }

    // Add manually curated mappings for major tokens
    const manualMappings: TokenMapping[] = [
        // USDC on multiple chains (same icon)
        { token: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', chainId: 1, slug: 'pegged/usd-coin', name: 'USD Coin', symbol: 'USDC' },
        { token: '0x0b2c639c533813f4aa9d7837caf62653d097ff85', chainId: 10, slug: 'pegged/usd-coin', name: 'USD Coin', symbol: 'USDC' },
        { token: '0x2791bca1f2de4661ed88a30c99a7a9449aa84174', chainId: 137, slug: 'pegged/usd-coin', name: 'USD Coin', symbol: 'USDC' },
        { token: '0xaf88d065e77c8cc2239327c5edb3a432268e5831', chainId: 42161, slug: 'pegged/usd-coin', name: 'USD Coin', symbol: 'USDC' },
        { token: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', chainId: 8453, slug: 'pegged/usd-coin', name: 'USD Coin', symbol: 'USDC' },
        { token: '0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e', chainId: 43114, slug: 'pegged/usd-coin', name: 'USD Coin', symbol: 'USDC' },
        
        // USDT on multiple chains
        { token: '0xdac17f958d2ee523a2206206994597c13d831ec7', chainId: 1, slug: 'pegged/tether', name: 'Tether', symbol: 'USDT' },
        { token: '0x94b008aa00579c1307b0ef2c499ad98a8ce58e58', chainId: 10, slug: 'pegged/tether', name: 'Tether', symbol: 'USDT' },
        { token: '0xc2132d05d31c914a87c6611c10748aeb04b58e8f', chainId: 137, slug: 'pegged/tether', name: 'Tether', symbol: 'USDT' },
        { token: '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9', chainId: 42161, slug: 'pegged/tether', name: 'Tether', symbol: 'USDT' },
        { token: '0x9702230a8ea53601f5cd2dc00fdbc13d4df4a8c7', chainId: 43114, slug: 'pegged/tether', name: 'Tether', symbol: 'USDT' },
        { token: '0x55d398326f99059ff775485246999027b3197955', chainId: 56, slug: 'pegged/tether', name: 'Tether', symbol: 'USDT' },
        
        // DAI
        { token: '0x6b175474e89094c44da98b954eedeac495271d0f', chainId: 1, slug: 'pegged/dai', name: 'Dai', symbol: 'DAI' },
        { token: '0xda10009cbd5d07dd0cecc66161fc93d7c9000da1', chainId: 10, slug: 'pegged/dai', name: 'Dai', symbol: 'DAI' },
        { token: '0xda10009cbd5d07dd0cecc66161fc93d7c9000da1', chainId: 42161, slug: 'pegged/dai', name: 'Dai', symbol: 'DAI' },
        
        // FRAX
        { token: '0x853d955acef822db058eb8505911ed77f175b99e', chainId: 1, slug: 'pegged/frax', name: 'Frax', symbol: 'FRAX' },
        
        // LUSD
        { token: '0x5f98805a4e8be255a32880fdec7f6728c6568ba0', chainId: 1, slug: 'pegged/liquity-usd', name: 'Liquity USD', symbol: 'LUSD' },
        
        // sUSD
        { token: '0x57ab1ec28d129707052df4df418d58a2d46d5f51', chainId: 1, slug: 'pegged/susd', name: 'sUSD', symbol: 'sUSD' },
        
        // GUSD
        { token: '0x056fd409e1d7a124bd7017459dfea2f387b6d5cd', chainId: 1, slug: 'pegged/gemini-dollar', name: 'Gemini Dollar', symbol: 'GUSD' },
        
        // USDP
        { token: '0x8e870d67f660d95d5be530380d0ec0bd388289e1', chainId: 1, slug: 'pegged/pax-dollar', name: 'Pax Dollar', symbol: 'USDP' },
        
        // TUSD
        { token: '0x0000000000085d4780b73119b644ae5ecd22b376', chainId: 1, slug: 'pegged/true-usd', name: 'TrueUSD', symbol: 'TUSD' },
        
        // BUSD
        { token: '0x4fabb145d64652a948d72533023f6e7a623c7c53', chainId: 1, slug: 'pegged/binance-usd', name: 'Binance USD', symbol: 'BUSD' },
        
        // crvUSD
        { token: '0xf939e0a03fb07f59a73314e73794be0e57ac1b4e', chainId: 1, slug: 'pegged/crvusd', name: 'Curve USD', symbol: 'crvUSD' },
        
        // GHO
        { token: '0x40d16fc0246ad3160ccc09b8d0d3a2cd28ae6c2f', chainId: 1, slug: 'pegged/gho', name: 'GHO', symbol: 'GHO' },
        
        // PYUSD
        { token: '0x6c3ea9036406852006290770bedfcaba0e23a0e8', chainId: 1, slug: 'pegged/paypal-usd', name: 'PayPal USD', symbol: 'PYUSD' },
        
        // DOLA
        { token: '0x865377367054516e17014ccded1e7d814edc9ce4', chainId: 1, slug: 'pegged/dola-usd', name: 'DOLA', symbol: 'DOLA' },
        
        // USDD
        { token: '0x0c10bf8fcb7bf5412187a595ab97a3609160b5c6', chainId: 1, slug: 'pegged/usdd', name: 'USDD', symbol: 'USDD' },
    ];

    // Merge mappings (manual takes precedence)
    const manualKeys = new Set(manualMappings.map(m => `${m.token}-${m.chainId}`));
    const finalMappings = [
        ...manualMappings,
        ...mappings.filter(m => !manualKeys.has(`${m.token}-${m.chainId}`)),
    ];

    // Deduplicate
    const seen = new Set<string>();
    const uniqueMappings = finalMappings.filter(m => {
        const key = `${m.token}-${m.chainId}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });

    // Write output
    const output = {
        version: '1.0.0',
        generatedAt: new Date().toISOString().split('T')[0],
        contract: '0x342e808c40D8E00656fEd124CA11aEcBB96c61Fc',
        network: 'mainnet',
        description: 'Token address to icon slug mappings for IconRegistry',
        usage: {
            solidity: 'registry.getIconByToken(tokenAddress, chainId)',
            ethersjs: 'await registry.getIconByToken("0x...", 1) // Returns PNG bytes',
        },
        mappings: uniqueMappings.sort((a, b) => a.chainId - b.chainId || a.token.localeCompare(b.token)),
    };

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2) + '\n');
    console.log(`\nWrote ${uniqueMappings.length} mappings to ${OUTPUT_FILE}`);

    // Summary by chain
    const byChain = new Map<number, number>();
    uniqueMappings.forEach(m => byChain.set(m.chainId, (byChain.get(m.chainId) || 0) + 1));
    console.log('\nMappings by chain:');
    [...byChain.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).forEach(([chainId, count]) => {
        console.log(`  Chain ${chainId}: ${count} tokens`);
    });
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
