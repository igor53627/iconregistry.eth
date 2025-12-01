# On-Chain Icon Registry

A curated registry of protocol/token icons stored on Ethereum using gas-efficient storage techniques.

## Storage Strategy: SSTORE2 vs SSTORE3

### The Problem with Regular Storage (SSTORE)

| Operation | Cost |
|-----------|------|
| Write 32 bytes | 22,100 gas (~690 gas/byte) |
| Read 32 bytes | 2,100 gas (cold) / 100 gas (warm) |

For a 1 KB icon: **~690,000 gas to write** (~$50 at 30 gwei, $2500 ETH)

### SSTORE2: Store Data as Contract Bytecode

Instead of using storage slots, SSTORE2 deploys data as a contract's bytecode:

```solidity
// Writing: Deploy a contract with data as bytecode
address pointer = SSTORE2.write(iconBytes);

// Reading: Use EXTCODECOPY (much cheaper than SLOAD)
bytes memory icon = SSTORE2.read(pointer);
```

| Operation | Cost |
|-----------|------|
| Write | ~200 gas/byte |
| Read | ~3 gas/byte |

**3-4x cheaper writes, 30x cheaper reads!**

For a 1 KB icon: **~200,000 gas to write** (~$15)

### SSTORE3: Deterministic Addresses with Compact Pointers

SSTORE2 returns a 20-byte address pointer. SSTORE3 improves this:

- Uses CREATE2 with a salt for deterministic addresses
- Pointer is just the salt (can be 4-8 bytes)
- Pointers can be packed with other data

```solidity
// Writing: Store with a salt-based pointer
bytes32 salt = bytes32(iconId);
SSTORE3.write(iconBytes, salt);

// Reading: Compute address from salt, no stored pointer needed
bytes memory icon = SSTORE3.read(salt);
```

### Cost Comparison for 10,000 Icons (32×32 PNG, ~1KB each)

| Method | Write Cost | Storage Overhead | Total |
|--------|-----------|------------------|-------|
| Regular SSTORE | ~$500,000 | N/A | ~$500,000 |
| SSTORE2 | ~$150,000 | 200KB (pointers) | ~$155,000 |
| SSTORE3 | ~$150,000 | 40KB (salts) | ~$151,000 |
| IPFS + hash on-chain | ~$5,000 | 320KB (CIDs) | ~$5,500 |

### Recommendation

1. **For full on-chain**: Use SSTORE2/SSTORE3 with optimized 32×32 PNGs
2. **For hybrid**: Store IPFS CID on-chain, icons on IPFS/Arweave
3. **For maximum decentralization**: SSTORE2 + fallback to IPFS

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
- **Size**: 32×32 pixels
- **Max file size**: 2 KB (target: <1 KB)
- **Naming**: lowercase, kebab-case (e.g., `uniswap.png`, `ethereum.png`)

## Usage

```solidity
interface IIconRegistry {
    function getIcon(bytes32 id) external view returns (bytes memory);
    function getIconURI(bytes32 id) external view returns (string memory);
}
```

## License

MIT
