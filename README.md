# iconregistry.eth

An on-chain, upgradeable repository for PNG icons, designed to provide a canonical source of visual assets for dApps and wallets.

**Demo:** https://igor53627.github.io/iconregistry.eth/

## Deployed Contracts

| Network | Contract | Address |
|---------|----------|---------|
| Ethereum Mainnet | Proxy (use this) | [`0x342e808c40D8E00656fEd124CA11aEcBB96c61Fc`](https://etherscan.io/address/0x342e808c40D8E00656fEd124CA11aEcBB96c61Fc) |
| Ethereum Mainnet | Implementation | [`0x99232b848594a149b2e68239ad4aa811abbb26cd`](https://etherscan.io/address/0x99232b848594a149b2e68239ad4aa811abbb26cd#code) |

Verified on [Etherscan](https://etherscan.io/address/0x99232b848594a149b2e68239ad4aa811abbb26cd#code) and [Sourcify](https://repo.sourcify.dev/contracts/full_match/1/0x99232b848594a149b2e68239ad4aa811abbb26cd/).

See [Deployment Report](docs/mainnet-deployment-report.md) for upload transaction details.

## Overview

The Icon Registry protocol utilizes the SSTORE2 library to store icon data gas-efficiently, with each icon being written as an immutable data blob.

Icons are identified by a human-readable slug (e.g., `protocols/uniswap`), which is hashed for on-chain operations. The registry supports versioning, allowing for icon updates while preserving access to all historical versions.

The owner can map these icons to specific token addresses on different chains or directly to chain IDs, enabling easy lookups for front-end integrations. The contract is built using the UUPS upgradeable proxy pattern, allowing for future logic changes by the owner.

## Architecture

```
                    ┌─────────────────────────────────────────────────────────┐
                    │                     IconRegistry                        │
                    │              (UUPS Upgradeable Proxy)                   │
                    └─────────────────────────────────────────────────────────┘
                                            │
              ┌─────────────────────────────┼─────────────────────────────┐
              │                             │                             │
              ▼                             ▼                             ▼
    ┌─────────────────┐          ┌─────────────────┐          ┌─────────────────┐
    │   SSTORE2       │          │   OpenZeppelin  │          │  IIconRegistry  │
    │   (Storage)     │          │   (Ownable,     │          │   (Interface)   │
    │                 │          │    UUPS)        │          │                 │
    └─────────────────┘          └─────────────────┘          └─────────────────┘

    Read Functions:                      Admin Functions:
    - getIconBySlug()                    - setIcon()
    - getIconByToken()                   - setIconsBatch()
    - batchGetIcons()                    - mapToken()
    - getChainIcon()                     - mapTokensBatch()
                                         - mapChain()
                                         - withdrawETH()
                                         - withdrawToken()
```

## Why On-Chain Icons

When a wallet or dApp fetches token icons from external servers, it creates privacy leaks:

| Aspect | External CDN | On-Chain (SSTORE2) |
|--------|-------------|-------------------|
| IP logged per icon | Yes | No (RPC only) |
| Token holdings exposed | Yes | No |
| Activity timestamps | Yes | No |
| Third-party dependency | Yes | No |
| Can be censored | Yes | No |
| Survives CDN shutdown | No | Yes |

**Benefits:**
- No additional tracking - icons come from same RPC as other data
- Censorship resistant - icons can't be removed or blocked
- Permanent - no CDN shutdown risk
- Verifiable - icons are immutable and can be verified on-chain
- Decentralized storage - no centralized CDN or hosting dependency

**Trust model:** A single privileged owner controls registry contents and upgrades. No user-submitted or permissionless data paths exist.

## Usage

```solidity
// Get icon by slug
bytes memory icon = registry.getIconBySlug("protocols/uniswap");

// Get icon by token address
bytes memory tokenIcon = registry.getIconByToken(0xA0b86991c..., 1); // USDC on mainnet

// Get chain icon
bytes memory ethIcon = registry.getChainIcon(1); // Ethereum

// Get as data URI (for direct use in img src)
string memory dataUri = registry.getIconDataURI(slugHash);
```

## Entry Points

All core functions that modify the registry's content are restricted to the contract owner. The only state-changing interaction available to the general public is for making donations.

| Actor | Capabilities |
|-------|-------------|
| Any User | Send ETH to the contract via `receive()` to support the registry |
| Owner | Manage registry via admin functions |

## Icon Discovery

The registry provides JSON manifests for off-chain icon discovery:

| File | Size | Description |
|------|------|-------------|
| [`manifest.json`](docs/manifest.json) | ~3MB | Full icon data with keywords for fuzzy matching |
| [`manifest-index.json`](docs/manifest-index.json) | ~336KB | Lightweight lookup tables |

### Manifest Index

The index provides direct lookup tables:

```javascript
// Load the index
const index = await fetch('https://igor53627.github.io/iconregistry.eth/manifest-index.json').then(r => r.json());

// Look up chain icon slug by chain ID
const ethSlug = index.chainIdToSlug[1];  // "chains/ethereum"
const arbSlug = index.chainIdToSlug[42161];  // "chains/arbitrum"

// Look up token icon slug by chainId:address
const usdcSlug = index.tokenToSlug["1:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48"];  // "pegged/usd-coin"

// Browse all slugs by category
index.slugsByCategory.chains;     // ["chains/ethereum", "chains/arbitrum", ...]
index.slugsByCategory.protocols;  // ["protocols/uniswap", "protocols/aave", ...]
index.slugsByCategory.pegged;     // ["pegged/tether", "pegged/usd-coin", ...]
```

### Full Manifest

The full manifest includes keywords for fuzzy matching:

```javascript
const manifest = await fetch('https://igor53627.github.io/iconregistry.eth/manifest.json').then(r => r.json());

// Search by keyword
const matches = manifest.icons.filter(icon => 
  icon.keywords.some(k => k.includes('uniswap'))
);
// Returns: [{ slug: "protocols/uniswap", slugHash: "0x...", keywords: ["uniswap"], ... }]
```

### Current Stats

| Category | Count |
|----------|-------|
| Chains | 1,361 |
| Protocols | 9,044 |
| Stablecoins | 345 |
| Chain mappings | 333 |
| Token mappings | 74 |

## Icon Specifications

On-chain validation (enforced by the contract):
- **Format**: PNG only - validated via the standard 8-byte PNG magic header

Operational guidelines (followed by this repository):
- **Size**: 64x64 pixels
- **Max file size**: 4 KB (target: <2 KB)
- **Naming**: lowercase slug (e.g., `protocols/uniswap`, `chains/ethereum`)

## Security

See [audits/](audits/) for security audit reports and responses.

## Alternatives

| Solution | Storage | Format | Privacy | Censorship Resistant |
|----------|---------|--------|---------|---------------------|
| **IconRegistry** | On-chain (SSTORE2) | PNG | Yes | Yes |
| [ERC-2569](https://eips.ethereum.org/EIPS/eip-2569) | On-chain (SSTORE) | SVG only | Yes | Yes |
| [Token Lists](https://tokenlists.org/) | Off-chain JSON | Any | No | No |
| [DefiLlama Icons](https://icons.llama.fi/) | CDN | PNG/SVG | No | No |
| [Trust Wallet Assets](https://github.com/trustwallet/assets) | GitHub + CDN | PNG | No | No |

## Icon Sources

All icons are sourced from [DefiLlama Icons](https://github.com/DefiLlama/icons) repository, processed to 64x64 PNG with lossless compression.

## Donate

Support the project by donating to: **[iconregistry.eth](https://app.ens.domains/iconregistry.eth)**

## License

MIT
