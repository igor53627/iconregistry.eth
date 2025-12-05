# IconRegistry Project Guidelines

## Icon Pipeline

- **On-chain icons are 64×64 PNGs**, preprocessed from 400×400 source images
- Source: DefiLlama icons fetched via `scripts/sync-defillama.js`
- Canonical upload source: `icons-64/` directory
- Docs/demo icons: `docs/` directory (also 64×64)

## Key Directories

- `icons-64/` - Preprocessed 64×64 icons for on-chain upload (ACTIVE)
- `docs/` - 64×64 icons for GitHub Pages demo site (ACTIVE)
- `contracts/` - Solidity contracts (IconRegistry.sol)
- `scripts/` - Deployment and sync scripts

## Commands

```bash
# Sync icons from DefiLlama
npx tsx scripts/sync-defillama.js

# Deploy icons to mainnet (uses Turnkey)
npx tsx scripts/deploy-icons-turnkey.ts

# Verify on-chain icons
npx tsx scripts/verify-icons.js

# Setup chain ID mappings
npx tsx scripts/setup-chain-mappings.ts
```

## Contract

- Proxy: `0x342e808c40D8E00656fEd124CA11aEcBB96c61Fc` (mainnet)
- Owner signs via Turnkey (credentials in GitHub secrets)

## Slug Convention

- Format: `{category}/{name}` (e.g., `chains/rszethereum`, `protocols/uniswap`)
- Prefix `rsz` indicates resized icons
