# iconregistry.eth - on-chain icons

A curated registry of protocol/token icons stored on Ethereum using gas-efficient storage techniques.

**Demo:** https://igor53627.github.io/iconregistry.eth/

## Why On-Chain Icons Matter for Privacy

### The Problem with External Icon CDNs

When a wallet or dApp fetches token icons from external servers, it creates **privacy leaks**:

```
User opens wallet
    → Wallet requests icon from https://icons.example.com/eth.png
    → CDN logs: IP address, timestamp, User-Agent, token being viewed
    → CDN knows: which tokens you hold, when you check your wallet
```

**What CDN operators can learn:**
- Your IP address (approximate location)
- Which tokens/protocols you interact with
- Your portfolio composition (by analyzing icon requests)
- When you're active (timestamps)
- Device fingerprinting via headers

This data can be:
- Sold to analytics companies
- Subpoenaed by governments
- Leaked in data breaches
- Used for targeted phishing attacks

### The On-Chain Solution

With on-chain icons via SSTORE2:

```
User opens wallet
    → Wallet reads icon from Ethereum RPC (same as balance checks)
    → No additional external requests
    → No new privacy leaks
```

**Benefits:**
- **No additional tracking** - icons come from same RPC as other data
- **Censorship resistant** - icons can't be removed or blocked
- **Permanent** - no CDN shutdown risk
- **Verifiable** - icons are immutable and can be verified on-chain
- **Decentralized** - no single point of failure

### Privacy Comparison

| Aspect | External CDN | On-Chain (SSTORE2) |
|--------|-------------|-------------------|
| IP logged per icon | Yes | No (RPC only) |
| Token holdings exposed | Yes | No |
| Activity timestamps | Yes | No |
| Third-party dependency | Yes | No |
| Can be censored | Yes | No |
| Survives CDN shutdown | No | Yes |

### Ideal for Privacy-Focused Wallets

Wallets like Ambire, Rabby, and others that prioritize user privacy can use on-chain icons to eliminate this tracking vector entirely.

## Project Structure

```
icons/
├── contracts/
│   ├── IconRegistry.sol      # Main registry contract
│   ├── IconStorage.sol       # SSTORE2-based storage
│   └── interfaces/
├── scripts/
│   ├── optimize-icons.ts     # Resize & optimize PNGs
│   ├── deploy.ts             # Deploy contracts
│   └── upload-icons.ts       # Upload icons to chain
├── icons/                    # Curated, optimized icons (32x32)
│   ├── tokens/
│   ├── chains/
│   └── protocols/
└── test/
```

## Icon Specifications

- **Format**: PNG (optimized) or SVG (hand-crafted only)
- **Size**: 64×64 pixels (future-proof for all wallet sizes)
- **Max file size**: 4 KB (target: <2 KB)
- **Naming**: lowercase, kebab-case (e.g., `uniswap.png`, `ethereum.png`)

### Why 64×64?

Our icons are sized at 64×64 pixels to cleanly scale down to all wallet icon sizes:

| Wallet | Icon Sizes Used |
|--------|----------------|
| MetaMask | 16, 24, 32, 40, 48px |
| Rabby | 16, 20, 24, 28, 32px |
| Token Lists | 32px |

At 64px, icons scale down to any size without interpolation artifacts (64 → 32 → 16 are clean 2x/4x divisions). This future-proofs the registry as wallets adopt higher-resolution displays.

## Usage

```solidity
interface IIconRegistry {
    function getIcon(bytes32 id) external view returns (bytes memory);
    function getIconURI(bytes32 id) external view returns (string memory);
}
```

## Donate

Support the IconRegistry project by donating to our ENS address:

**[iconregistry.eth](https://app.ens.domains/iconregistry.eth)**

Donations help cover on-chain storage costs and ongoing maintenance.

## Alternatives

| Solution | Storage | Format | Privacy | Censorship Resistant |
|----------|---------|--------|---------|---------------------|
| **IconRegistry (this)** | On-chain (SSTORE2) | PNG | Yes | Yes |
| [ERC-2569](https://eips.ethereum.org/EIPS/eip-2569) | On-chain (SSTORE) | SVG only | Yes | Yes |
| [Token Lists](https://tokenlists.org/) | Off-chain JSON | Any | No | No |
| [DefiLlama Icons](https://icons.llama.fi/) | CDN | PNG/SVG | No | No |
| [Trust Wallet Assets](https://github.com/trustwallet/assets) | GitHub + CDN | PNG | No | No |

ERC-2569 (2020, Stagnant) proposed on-chain SVG storage but was never widely adopted. IconRegistry is the first general-purpose on-chain PNG registry using gas-efficient SSTORE2.

## Icon Sources

All icons are sourced from [DefiLlama Icons](https://github.com/DefiLlama/icons) repository, processed to 64×64 PNG with lossless compression (sharp + oxipng).

| Source | URL |
|--------|-----|
| GitHub | https://github.com/DefiLlama/icons |
| CDN | https://icons.llama.fi/ |

## License

MIT
