# IconRegistry

> Upgradeable registry for on-chain icons with token address and slug lookups

**Author:** iconregistry.eth

UUPS upgradeable contract. Must be deployed behind an ERC1967 proxy.
Icons are stored via SSTORE2 as immutable byte blobs. Each icon update creates
a new version while preserving historical versions.

**Trust model:** Single privileged owner controls all icon content, mappings, and upgrades.
No user-submitted or permissionless data paths exist.

## Contract Address

| Network | Address |
|---------|---------|
| Ethereum Mainnet | *Coming soon* |
| Sepolia Testnet | *Coming soon* |

## Data Model

### Icon Struct

```solidity
struct Icon {
    address pointer;     // SSTORE2 pointer contract address
    uint32 width;        // Image width in pixels
    uint32 height;       // Image height in pixels
    uint32 version;      // Version number (starts at 1)
    IconFormat format;   // Image format enum
}
```

### IconFormat Enum

| Value | Name | MIME Type |
|-------|------|-----------|
| 0 | PNG | `image/png` |
| 1 | SVG | `image/svg+xml` |
| 2 | WEBP | `image/webp` |

### Slug System

Icons are identified by **slugs** - human-readable strings like:
- `protocols/uniswap`
- `chains/ethereum`
- `tokens/usdc`

On-chain, slugs are stored as their `keccak256` hash (`slugHash`) for gas efficiency.

## Events

### IconAdded

```solidity
event IconAdded(bytes32 indexed slugHash, string slug, address pointer, uint32 version);
```

Emitted when a new icon is added for a slug.

### IconUpdated

```solidity
event IconUpdated(bytes32 indexed slugHash, string slug, address pointer, uint32 version);
```

Emitted when an existing icon is updated to a new version.

### TokenMapped

```solidity
event TokenMapped(address indexed token, uint256 indexed chainId, bytes32 slugHash);
```

Emitted when a token is mapped to an icon slug.

### ChainMapped

```solidity
event ChainMapped(uint256 indexed chainId, bytes32 slugHash);
```

Emitted when a chain ID is mapped to a chain icon.

## Errors

| Error | Description |
|-------|-------------|
| `IconNotFound()` | Icon requested for a slug that has not been registered |
| `InvalidData()` | Provided data is invalid (empty bytes, mismatched array lengths) |
| `VersionNotFound()` | Requested icon version does not exist |
| `TransferFailed()` | ETH or token transfer failed |
| `LengthMismatch()` | Batch arrays have mismatched lengths |

---

## Read Functions

### getIconBySlug

```solidity
function getIconBySlug(string calldata slug) external view returns (bytes memory)
```

Get icon by slug string (latest version).

**Parameters:**
- `slug` - Human-readable slug (e.g., "protocols/uniswap")

**Returns:** Raw icon bytes (PNG/SVG/WEBP data)

### getIcon

```solidity
function getIcon(bytes32 slugHash) external view returns (bytes memory)
```

Get icon by pre-computed slug hash (latest version). More gas efficient when slug hash is known.

**Parameters:**
- `slugHash` - `keccak256(bytes(slug))`

**Returns:** Raw icon bytes

### getIconVersion

```solidity
function getIconVersion(bytes32 slugHash, uint32 version) external view returns (bytes memory)
```

Get specific version of an icon.

**Parameters:**
- `slugHash` - `keccak256(bytes(slug))`
- `version` - Version number (1-indexed)

**Returns:** Raw icon bytes for that version

### getCurrentVersion

```solidity
function getCurrentVersion(bytes32 slugHash) external view returns (uint32)
```

Get current version number for a slug.

**Parameters:**
- `slugHash` - `keccak256(bytes(slug))`

**Returns:** Current version number (1 or higher)

### getIconInfo

```solidity
function getIconInfo(bytes32 slugHash) external view returns (
    address pointer,
    uint32 width,
    uint32 height,
    uint32 version,
    IconFormat format
)
```

Get icon metadata including version.

**Parameters:**
- `slugHash` - `keccak256(bytes(slug))`

**Returns:**
- `pointer` - SSTORE2 pointer address
- `width` - Image width in pixels
- `height` - Image height in pixels
- `version` - Current version number
- `format` - Image format enum value

### getIconByToken

```solidity
function getIconByToken(address token, uint256 chainId) external view returns (bytes memory)
```

Get icon by token address and chainId.

**Parameters:**
- `token` - Token contract address
- `chainId` - Chain ID where token is deployed

**Returns:** Raw icon bytes

### hasTokenIcon

```solidity
function hasTokenIcon(address token, uint256 chainId) external view returns (bool)
```

Check if token has icon mapped.

**Parameters:**
- `token` - Token contract address
- `chainId` - Chain ID where token is deployed

**Returns:** True if an icon is mapped for this token+chainId

### getChainIcon

```solidity
function getChainIcon(uint256 chainId) external view returns (bytes memory)
```

Get chain icon by chainId.

**Parameters:**
- `chainId` - EVM chain ID (e.g., 1 for Ethereum)

**Returns:** Raw icon bytes

### getIconDataURI

```solidity
function getIconDataURI(bytes32 slugHash) external view returns (string memory)
```

Get icon as data URI (for direct use in img src).

> ⚠️ **Gas-heavy** - Intended for off-chain use only.

**Parameters:**
- `slugHash` - `keccak256(bytes(slug))`

**Returns:** Data URI string (e.g., "data:image/png;base64,...")

### getTokenIconDataURI

```solidity
function getTokenIconDataURI(address token, uint256 chainId) external view returns (string memory)
```

Get token icon as data URI.

> ⚠️ **Gas-heavy** - Intended for off-chain use only.

**Parameters:**
- `token` - Token contract address
- `chainId` - Chain ID where token is deployed

**Returns:** Data URI string

### batchGetIcons

```solidity
function batchGetIcons(bytes32[] calldata slugHashes) external view returns (bytes[] memory result)
```

Batch get icons by slug hashes.

**Parameters:**
- `slugHashes` - Array of `keccak256(bytes(slug))` values

**Returns:** Array of icon bytes (empty for missing icons - does not revert)

### batchGetTokenIcons

```solidity
function batchGetTokenIcons(
    address[] calldata tokens,
    uint256[] calldata chainIds
) external view returns (bytes[] memory result)
```

Batch get icons by tokens.

**Parameters:**
- `tokens` - Array of token contract addresses
- `chainIds` - Array of chain IDs for each token

**Returns:** Array of icon bytes (empty for unmapped tokens - does not revert)

### totalIcons

```solidity
function totalIcons() external view returns (uint256)
```

Get total number of unique slugs (icons) registered.

**Returns:** Number of icons that have been added

### getSlugsPaginated

```solidity
function getSlugsPaginated(uint256 offset, uint256 limit) external view returns (bytes32[] memory result)
```

Get a paginated list of slug hashes.

**Parameters:**
- `offset` - Starting index in the slugs array (0-based)
- `limit` - Maximum number of slug hashes to return

**Returns:** Array of slug hashes, truncated to available length

---

## Admin Functions

> 🔐 All admin functions are restricted to the contract owner.

### setIcon

```solidity
function setIcon(
    string calldata slug,
    bytes calldata data,
    uint32 width,
    uint32 height,
    IconFormat format
) external onlyOwner
```

Add or update icon by slug. If icon exists, creates new version. Old versions remain accessible via `getIconVersion`.

**Parameters:**
- `slug` - Human-readable identifier (e.g., "protocols/uniswap")
- `data` - Raw image bytes (PNG, SVG, or WEBP)
- `width` - Image width in pixels
- `height` - Image height in pixels
- `format` - Image format enum value

**Recommended max icon size:** 32KB for gas efficiency

### setIconsBatch

```solidity
function setIconsBatch(
    string[] calldata slugList,
    bytes[] calldata dataList,
    uint32[] calldata widths,
    uint32[] calldata heights,
    IconFormat[] calldata formats
) external onlyOwner
```

Batch add or update icons. All arrays must have identical lengths.

### mapToken

```solidity
function mapToken(address token, uint256 chainId, string calldata slug) external onlyOwner
```

Map token address to icon slug. Overwrites any existing mapping.

**Parameters:**
- `token` - Token contract address
- `chainId` - EVM chain ID (e.g., 1 for Ethereum mainnet)
- `slug` - Icon slug that must already exist in the registry

### mapTokensBatch

```solidity
function mapTokensBatch(
    address[] calldata tokens,
    uint256[] calldata chainIds,
    string[] calldata slugList
) external onlyOwner
```

Batch map tokens to icons. All arrays must have identical lengths.

### mapChain

```solidity
function mapChain(uint256 chainId, string calldata slug) external onlyOwner
```

Map chain ID to chain icon.

**Parameters:**
- `chainId` - EVM chain ID (e.g., 1 for Ethereum, 137 for Polygon)
- `slug` - Icon slug that must already exist in the registry

### withdrawETH

```solidity
function withdrawETH() external onlyOwner
```

Withdraw accumulated ETH donations to owner.

### withdrawToken

```solidity
function withdrawToken(address token) external onlyOwner
```

Withdraw donated ERC20 tokens to owner.

---

## Usage Examples

### Solidity

```solidity
import {IIconRegistry} from "./IIconRegistry.sol";

contract MyContract {
    IIconRegistry public iconRegistry;
    
    constructor(address _registry) {
        iconRegistry = IIconRegistry(_registry);
    }
    
    function getUniswapIcon() external view returns (bytes memory) {
        return iconRegistry.getIconBySlug("protocols/uniswap");
    }
    
    function getTokenIconURI(address token) external view returns (string memory) {
        return iconRegistry.getTokenIconDataURI(token, block.chainid);
    }
}
```

### Ethers.js v6

```typescript
import { ethers } from 'ethers';

const ICON_REGISTRY = '0x...';
const abi = ['function getIconBySlug(string) view returns (bytes)'];

const provider = new ethers.JsonRpcProvider('https://eth.llamarpc.com');
const registry = new ethers.Contract(ICON_REGISTRY, abi, provider);

// Get icon bytes
const iconBytes = await registry.getIconBySlug('protocols/uniswap');

// Convert to data URI for display
const base64 = Buffer.from(iconBytes.slice(2), 'hex').toString('base64');
const dataUri = `data:image/png;base64,${base64}`;
```

### Viem

```typescript
import { createPublicClient, http } from 'viem';
import { mainnet } from 'viem/chains';

const client = createPublicClient({
  chain: mainnet,
  transport: http(),
});

const iconBytes = await client.readContract({
  address: '0x...',
  abi: [{ name: 'getIconBySlug', type: 'function', inputs: [{ type: 'string' }], outputs: [{ type: 'bytes' }] }],
  functionName: 'getIconBySlug',
  args: ['protocols/uniswap'],
});
```

---

## Upgradeability

IconRegistry uses the UUPS (Universal Upgradeable Proxy Standard) pattern:

- **Proxy Contract:** Holds all storage and forwards calls to implementation
- **Implementation Contract:** Contains the logic, can be upgraded by owner
- **Storage Gap:** 50 slots reserved for future storage variables

### Upgrade Process

1. Deploy new implementation contract
2. Call `upgradeToAndCall(newImplementation, "")` on the proxy
3. Only the owner can authorize upgrades

### Storage Layout

| Slot | Variable |
|------|----------|
| 0-1 | OwnableUpgradeable |
| 2 | icons mapping |
| 3 | iconVersions mapping |
| 4 | tokenToIcon mapping |
| 5 | chainToIcon mapping |
| 6 | slugs array |
| 7 | slugIndex mapping |
| 8-57 | __gap (reserved) |

---

## Security Considerations

1. **Centralized Trust:** Owner controls all icon data and mappings
2. **Immutable Icons:** Once stored via SSTORE2, icon data cannot be modified (only versioned)
3. **No Reentrancy Risk:** Withdrawal functions update no state after external calls
4. **Gas Limits:** Large icons may cause view functions to run out of gas off-chain

## License

MIT
