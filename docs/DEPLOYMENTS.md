# IconRegistry Deployments

## Ethereum Mainnet

| Contract | Address | Verified |
|----------|---------|----------|
| **Proxy** | [`0x342e808c40D8E00656fEd124CA11aEcBB96c61Fc`](https://etherscan.io/address/0x342e808c40D8E00656fEd124CA11aEcBB96c61Fc) | [Etherscan](https://etherscan.io/address/0x342e808c40D8E00656fEd124CA11aEcBB96c61Fc#code), [Sourcify](https://repo.sourcify.dev/contracts/full_match/1/0x342e808c40D8E00656fEd124CA11aEcBB96c61Fc/) |
| **Implementation** | [`0xC194a4108Bd803dfB1DDcBACfB47BeBd49b6404F`](https://etherscan.io/address/0xC194a4108Bd803dfB1DDcBACfB47BeBd49b6404F#code) | [Etherscan](https://etherscan.io/address/0xC194a4108Bd803dfB1DDcBACfB47BeBd49b6404F#code), [Sourcify](https://repo.sourcify.dev/contracts/full_match/1/0xC194a4108Bd803dfB1DDcBACfB47BeBd49b6404F/) |
| Factory | [`0x05C4ba7b498251708A97437d7a70BEe3F45a9779`](https://etherscan.io/address/0x05C4ba7b498251708A97437d7a70BEe3F45a9779) | [Etherscan](https://etherscan.io/address/0x05C4ba7b498251708A97437d7a70BEe3F45a9779#code) |

### Deployment Details

- **Date**: December 3, 2025
- **Block**: 23934690
- **Deployer**: `0x34A3dc765F640C5d1419E5BAcCD42AaA0feb73e2`
- **Gas Used**: 4,470,569
- **Gas Price**: 0.032 gwei
- **Cost**: 0.000142 ETH

### Transactions

| Description | Tx Hash |
|-------------|---------|
| Deploy Factory | [`0x487ca4d7...`](https://etherscan.io/tx/0x487ca4d73280fca2169f7813a662bbc8f1314f113add8adb8892c8d54e72bbc6) |
| Deploy Impl + Proxy | [`0x848999398c...`](https://etherscan.io/tx/0x848999398c0f830ce0861d55405f78b35d519c887dd6cb81c8da9c760ea29fd4) |

## How to Interact

### Read Icons

```solidity
IIconRegistry registry = IIconRegistry(0x342e808c40D8E00656fEd124CA11aEcBB96c61Fc);

// Get icon by slug
bytes memory icon = registry.getIconBySlug("protocols/uniswap");

// Get icon by token address
bytes memory tokenIcon = registry.getIconByToken(0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48, 1); // USDC

// Get chain icon
bytes memory ethIcon = registry.getChainIcon(1); // Ethereum
```

### Using cast

```bash
# Check total icons
cast call 0x342e808c40D8E00656fEd124CA11aEcBB96c61Fc "totalIcons()(uint256)" --rpc-url https://eth.llamarpc.com

# Get icon by slug (returns PNG bytes)
cast call 0x342e808c40D8E00656fEd124CA11aEcBB96c61Fc "getIconBySlug(string)(bytes)" "chains/ethereum" --rpc-url https://eth.llamarpc.com
```
