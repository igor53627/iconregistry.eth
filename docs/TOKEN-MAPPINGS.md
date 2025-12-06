# Token Address Mappings

This document describes how to use token address to icon mappings in the IconRegistry contract.

**Contract:** `0x342e808c40D8E00656fEd124CA11aEcBB96c61Fc` (Ethereum Mainnet)

## Usage

### Solidity

```solidity
// Get token icon by address and chain ID
bytes memory icon = registry.getIconByToken(
    0xdAC17F958D2ee523a2206206994597C13D831ec7,  // USDT on Ethereum
    1  // Ethereum chain ID
);

// Check if a token has an icon mapped
bool hasIcon = registry.hasTokenIcon(tokenAddress, chainId);
```

### JavaScript/TypeScript (ethers.js)

```javascript
// Get USDT icon on Ethereum
const icon = await registry.getIconByToken(
    "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    1
);

// Get USDC icon on Base
const usdcBase = await registry.getIconByToken(
    "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    8453
);
```

## Current Mappings

See [token-mappings.json](./token-mappings.json) for the full list in JSON format.

### Summary

- **Total mappings:** 86
- **Chains covered:** 7 (Ethereum, Optimism, Polygon, Arbitrum, Base, Avalanche, BSC)
- **Focus:** Stablecoins (pegged assets)

### Major Tokens Mapped

| Token | Symbol | Chains |
|-------|--------|--------|
| Tether | USDT | ETH, OP, MATIC, ARB, AVAX, BSC |
| USD Coin | USDC | ETH, OP, MATIC, ARB, BASE, AVAX |
| Dai | DAI | ETH, OP, ARB |
| Frax | FRAX | ETH |
| GHO | GHO | ETH |
| crvUSD | crvUSD | ETH |
| PayPal USD | PYUSD | ETH |

## Architecture

### Same Icon, Multiple Chains

The contract supports mapping different token addresses to the same icon slug. This is ideal for multi-chain tokens:

```
USDC (Ethereum): 0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48 → pegged/usd-coin
USDC (Base):     0x833589fcd6edb6e08f4c7c32d4f71b54bda02913 → pegged/usd-coin
USDC (Arbitrum): 0xaf88d065e77c8cc2239327c5edb3a432268e5831 → pegged/usd-coin
```

All point to the same `pegged/usd-coin` icon, avoiding duplicate storage.

### Icon Updates

When an icon is updated via `setIcon`, all tokens mapped to that slug automatically see the new version. The contract maintains version history for rollback if needed.

## Adding New Mappings

### 1. Update token-mappings.json

Add new entries to `docs/token-mappings.json`:

```json
{
  "token": "0x...",
  "chainId": 1,
  "slug": "pegged/token-name",
  "name": "Token Name",
  "symbol": "TKN"
}
```

### 2. Ensure Icon Exists

The icon must already be uploaded to the registry. Check with:

```bash
cast call 0x342e808c40D8E00656fEd124CA11aEcBB96c61Fc \
  "getIconBySlug(string)(bytes)" "pegged/token-name" \
  --rpc-url https://eth.drpc.org
```

### 3. Deploy Mappings

Run the setup script or GitHub workflow:

```bash
# Dry run first
DRY_RUN=true npx tsx scripts/setup-token-mappings.ts

# Deploy
npx tsx scripts/setup-token-mappings.ts
```

## Syncing from DefiLlama

The `sync-token-mappings.ts` script fetches stablecoin data from DefiLlama and matches with available icons:

```bash
npx tsx scripts/sync-token-mappings.ts
```

This generates `docs/token-mappings.json` with matched mappings.

## Gas Costs

- **Per mapping:** ~45,000 gas
- **Batch of 100:** ~4.5M gas
- **Estimated cost:** ~0.0002 ETH at 0.05 gwei for 100 mappings

## Related

- [Chain ID Mappings](./CHAIN-MAPPINGS.md)
- [IconRegistry Contract](../contracts/IconRegistry.sol)
