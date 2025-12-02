# IconRegistry Smart Contracts

On-chain icon registry for privacy-preserving token and protocol icons.

## Overview

IconRegistry stores icons directly on Ethereum using [SSTORE2](https://github.com/Vectorized/solady/blob/main/src/utils/SSTORE2.sol) for gas-efficient storage. This enables wallets and dApps to fetch icons without leaking user data to external CDNs.

## Contracts

| Contract | Description |
|----------|-------------|
| [IconRegistry](./IconRegistry.md) | Main upgradeable registry contract |
| [IIconRegistry](./IIconRegistry.md) | Interface for integrators |

## Deployed Addresses

| Network | Proxy | Implementation |
|---------|-------|----------------|
| Ethereum Mainnet | *Coming soon* | *Coming soon* |
| Sepolia Testnet | *Coming soon* | *Coming soon* |

## Quick Start

### Reading Icons

```solidity
IIconRegistry registry = IIconRegistry(REGISTRY_ADDRESS);

// By slug
bytes memory icon = registry.getIconBySlug("protocols/uniswap");

// By token address
bytes memory tokenIcon = registry.getIconByToken(USDC_ADDRESS, 1);

// As data URI (for display)
string memory uri = registry.getIconDataURI(slugHash);
```

### JavaScript/TypeScript

```typescript
import { createPublicClient, http, keccak256, toHex } from 'viem';
import { mainnet } from 'viem/chains';

const client = createPublicClient({ chain: mainnet, transport: http() });

// Get icon bytes
const icon = await client.readContract({
  address: REGISTRY_ADDRESS,
  abi: IconRegistryABI,
  functionName: 'getIconBySlug',
  args: ['protocols/uniswap'],
});

// Convert to image
const blob = new Blob([icon], { type: 'image/png' });
const imageUrl = URL.createObjectURL(blob);
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      ERC1967 Proxy                          │
│  (Storage + Delegatecall to Implementation)                 │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                    IconRegistry                             │
│  ├── icons[slugHash] → Icon struct                          │
│  ├── iconVersions[slugHash][version] → Icon struct          │
│  ├── tokenToIcon[token][chainId] → slugHash                 │
│  ├── chainToIcon[chainId] → slugHash                        │
│  └── slugs[] → bytes32 array for enumeration                │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                   SSTORE2 Pointers                          │
│  (Immutable bytecode containing PNG/SVG/WEBP data)          │
└─────────────────────────────────────────────────────────────┘
```

## Gas Costs

### Writing Icons

| Operation | Gas Cost | USD (30 gwei, $2500 ETH) |
|-----------|----------|--------------------------|
| setIcon (1KB PNG) | ~200,000 | ~$15 |
| setIcon (2KB PNG) | ~400,000 | ~$30 |
| mapToken | ~50,000 | ~$4 |
| mapChain | ~50,000 | ~$4 |

### Reading Icons

| Operation | Gas Cost |
|-----------|----------|
| getIcon | ~3 gas/byte |
| getIconBySlug | ~3 gas/byte + hash |
| getIconDataURI | ~10 gas/byte (includes base64) |

## Security

### Trust Model

- **Owner**: Controls all icon content, mappings, and upgrades
- **Icons**: Immutable once written (versioned updates only)
- **No User Input**: All data is admin-controlled

### Audit Status

- [ ] Internal review completed
- [ ] External audit scheduled
- [ ] Bug bounty program

## License

MIT
