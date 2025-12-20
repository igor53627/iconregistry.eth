#!/usr/bin/env npx tsx
/**
 * Verify that on-chain icons can be fetched and displayed on the demo page.
 * This script samples icons from the manifest and verifies they exist on-chain.
 */

import { createPublicClient, http, Hex } from 'viem';
import { mainnet } from 'viem/chains';
import * as fs from 'fs';
import * as path from 'path';

const REGISTRY_ADDRESS = '0x342e808c40D8E00656fEd124CA11aEcBB96c61Fc' as const;
const RPC_URL = process.env.RPC_URL || 'https://eth.drpc.org';
const SAMPLE_SIZE = parseInt(process.env.SAMPLE_SIZE || '20', 10);

const registryAbi = [
  {
    name: 'getIconBySlug',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'slug', type: 'string' }],
    outputs: [{ name: '', type: 'bytes' }],
  },
  {
    name: 'getIcon',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'slugHash', type: 'bytes32' }],
    outputs: [{ name: '', type: 'bytes' }],
  },
] as const;

interface ManifestIcon {
  slug: string;
  slugHash: string;
  category: string;
  name: string;
  keywords: string[];
}

interface Manifest {
  icons: ManifestIcon[];
  stats: {
    total: number;
    byCategory: Record<string, number>;
  };
}

async function main() {
  const manifestPath = path.join(__dirname, '../docs/manifest.json');
  
  if (!fs.existsSync(manifestPath)) {
    console.error('[FAIL] manifest.json not found at', manifestPath);
    process.exit(1);
  }

  const manifest: Manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  console.log(`[OK] Loaded manifest with ${manifest.icons.length} icons`);

  const client = createPublicClient({
    chain: mainnet,
    transport: http(RPC_URL),
  });

  // Sample icons across categories
  const categories = [...new Set(manifest.icons.map(i => i.category))];
  const sampled: ManifestIcon[] = [];
  
  for (const category of categories) {
    const categoryIcons = manifest.icons.filter(i => i.category === category);
    const perCategory = Math.max(1, Math.floor(SAMPLE_SIZE / categories.length));
    const shuffled = categoryIcons.sort(() => Math.random() - 0.5);
    sampled.push(...shuffled.slice(0, perCategory));
  }

  // Add some more random icons if we haven't reached sample size
  while (sampled.length < SAMPLE_SIZE && sampled.length < manifest.icons.length) {
    const random = manifest.icons[Math.floor(Math.random() * manifest.icons.length)];
    if (!sampled.find(s => s.slug === random.slug)) {
      sampled.push(random);
    }
  }

  console.log(`[OK] Sampling ${sampled.length} icons across ${categories.length} categories`);

  let passed = 0;
  let failed = 0;
  const failures: { slug: string; error: string }[] = [];

  let notOnChain = 0;
  
  for (const icon of sampled) {
    try {
      const data = await client.readContract({
        address: REGISTRY_ADDRESS,
        abi: registryAbi,
        functionName: 'getIconBySlug',
        args: [icon.slug],
      });

      if (!data || (data as Hex).length < 10) {
        console.log(`  [SKIP] ${icon.slug} (not on-chain)`);
        notOnChain++;
        continue;
      }

      // Verify PNG signature (89 50 4E 47 = PNG header)
      const hex = (data as Hex).slice(2);
      const pngSignature = hex.slice(0, 16);
      if (!pngSignature.startsWith('89504e47')) {
        failures.push({ slug: icon.slug, error: `Invalid PNG signature: ${pngSignature.slice(0, 16)}` });
        failed++;
        continue;
      }

      const sizeBytes = hex.length / 2;
      console.log(`  [OK] ${icon.slug} (${sizeBytes} bytes)`);
      passed++;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      // IconNotFound error (0xdf2f52d5) means icon not uploaded yet - not a failure
      if (errorMsg.includes('0xdf2f52d5') || errorMsg.includes('IconNotFound')) {
        console.log(`  [SKIP] ${icon.slug} (not on-chain)`);
        notOnChain++;
      } else {
        failures.push({ slug: icon.slug, error: errorMsg });
        failed++;
      }
    }
  }

  console.log('');
  console.log('='.repeat(60));
  console.log(`Results: ${passed} on-chain OK, ${notOnChain} not on-chain, ${failed} failed out of ${sampled.length} sampled`);

  if (failures.length > 0) {
    console.log('');
    console.log('Failures:');
    for (const f of failures) {
      console.log(`  [FAIL] ${f.slug}: ${f.error}`);
    }
  }

  // Fail if any on-chain icons have real errors (not just missing)
  if (failed > 0) {
    console.error('');
    console.error(`[FAIL] ${failed} on-chain icon(s) returned corrupted data`);
    process.exit(1);
  }
  
  // Warn if no icons are on-chain (demo page would be empty)
  if (passed === 0) {
    console.error('');
    console.error('[FAIL] No icons found on-chain - demo page will show only placeholders');
    process.exit(1);
  }

  console.log('');
  console.log('[OK] On-chain icon verification passed');
}

main().catch(err => {
  console.error('[FAIL] Unexpected error:', err);
  process.exit(1);
});
