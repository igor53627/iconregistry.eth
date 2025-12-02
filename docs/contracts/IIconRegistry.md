# IIconRegistry

> Interface for the on-chain icon registry

**Author:** iconregistry.eth

Stable ABI for integrators. All icon data is stored via SSTORE2.

This interface provides the public API that external contracts and clients should use to interact with the IconRegistry.

## Errors

### IconNotFound

```solidity
error IconNotFound();
```

Thrown when an icon is requested for a slug that has not been registered.

### VersionNotFound

```solidity
error VersionNotFound();
```

Thrown when a requested icon version does not exist.

---

## Functions

### By Slug

#### getIconBySlug

```solidity
function getIconBySlug(string calldata slug) external view returns (bytes memory);
```

Get icon by slug string (e.g., "protocols/uniswap").

| Parameter | Type | Description |
|-----------|------|-------------|
| `slug` | string | Human-readable identifier for the icon |

**Returns:** Raw icon bytes (PNG/SVG/WEBP)

#### getIcon

```solidity
function getIcon(bytes32 slugHash) external view returns (bytes memory);
```

Get icon by pre-computed `keccak256(slug)`. More gas efficient when slug hash is already known.

| Parameter | Type | Description |
|-----------|------|-------------|
| `slugHash` | bytes32 | `keccak256(bytes(slug))` |

**Returns:** Raw icon bytes

---

### Versioning

#### getIconVersion

```solidity
function getIconVersion(bytes32 slugHash, uint32 version) external view returns (bytes memory);
```

Get specific version of an icon.

| Parameter | Type | Description |
|-----------|------|-------------|
| `slugHash` | bytes32 | `keccak256(bytes(slug))` |
| `version` | uint32 | Version number (1-indexed) |

**Returns:** Raw icon bytes for that version

#### getCurrentVersion

```solidity
function getCurrentVersion(bytes32 slugHash) external view returns (uint32);
```

Get current version number for a slug.

| Parameter | Type | Description |
|-----------|------|-------------|
| `slugHash` | bytes32 | `keccak256(bytes(slug))` |

**Returns:** Current version number (1 or higher)

#### getIconInfo

```solidity
function getIconInfo(bytes32 slugHash) external view returns (
    address pointer,
    uint32 width,
    uint32 height,
    uint32 version,
    uint8 format
);
```

Get icon metadata including version.

| Parameter | Type | Description |
|-----------|------|-------------|
| `slugHash` | bytes32 | `keccak256(bytes(slug))` |

**Returns:**

| Name | Type | Description |
|------|------|-------------|
| `pointer` | address | SSTORE2 pointer address |
| `width` | uint32 | Image width in pixels |
| `height` | uint32 | Image height in pixels |
| `version` | uint32 | Current version number |
| `format` | uint8 | Image format (0=PNG, 1=SVG, 2=WEBP) |

---

### By Token

#### getIconByToken

```solidity
function getIconByToken(address token, uint256 chainId) external view returns (bytes memory);
```

Get icon by token contract address.

| Parameter | Type | Description |
|-----------|------|-------------|
| `token` | address | Token contract address |
| `chainId` | uint256 | Chain ID where token is deployed (e.g., 1 for Ethereum mainnet) |

**Returns:** Raw icon bytes

#### hasTokenIcon

```solidity
function hasTokenIcon(address token, uint256 chainId) external view returns (bool);
```

Check if token has an icon mapped.

| Parameter | Type | Description |
|-----------|------|-------------|
| `token` | address | Token contract address |
| `chainId` | uint256 | Chain ID where token is deployed |

**Returns:** True if an icon is mapped for this token+chainId

---

### By Chain

#### getChainIcon

```solidity
function getChainIcon(uint256 chainId) external view returns (bytes memory);
```

Get chain icon by chain ID (e.g., 1 for Ethereum).

| Parameter | Type | Description |
|-----------|------|-------------|
| `chainId` | uint256 | EVM chain ID |

**Returns:** Raw icon bytes

---

### Data URI

#### getIconDataURI

```solidity
function getIconDataURI(bytes32 slugHash) external view returns (string memory);
```

Get icon as base64 data URI for direct use in `<img src="">`.

> ⚠️ **Gas-heavy** - Intended for off-chain use

| Parameter | Type | Description |
|-----------|------|-------------|
| `slugHash` | bytes32 | `keccak256(bytes(slug))` |

**Returns:** Data URI string (e.g., "data:image/png;base64,...")

#### getTokenIconDataURI

```solidity
function getTokenIconDataURI(address token, uint256 chainId) external view returns (string memory);
```

Get token icon as data URI.

> ⚠️ **Gas-heavy** - Intended for off-chain use

| Parameter | Type | Description |
|-----------|------|-------------|
| `token` | address | Token contract address |
| `chainId` | uint256 | Chain ID where token is deployed |

**Returns:** Data URI string

---

### Batch

#### batchGetIcons

```solidity
function batchGetIcons(bytes32[] calldata slugHashes) external view returns (bytes[] memory);
```

Get multiple icons by slug hashes.

| Parameter | Type | Description |
|-----------|------|-------------|
| `slugHashes` | bytes32[] | Array of `keccak256(bytes(slug))` values |

**Returns:** Array of icon bytes (empty for missing icons - does not revert)

#### batchGetTokenIcons

```solidity
function batchGetTokenIcons(
    address[] calldata tokens,
    uint256[] calldata chainIds
) external view returns (bytes[] memory);
```

Get multiple icons by token addresses.

| Parameter | Type | Description |
|-----------|------|-------------|
| `tokens` | address[] | Array of token contract addresses |
| `chainIds` | uint256[] | Array of chain IDs for each token |

**Returns:** Array of icon bytes (empty for unmapped tokens - does not revert)

---

### Enumeration

#### totalIcons

```solidity
function totalIcons() external view returns (uint256);
```

Get total number of unique icons registered.

**Returns:** Number of icons

---

## Example Integration

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import {IIconRegistry} from "./IIconRegistry.sol";

contract TokenDisplay {
    IIconRegistry public immutable iconRegistry;
    
    constructor(address _registry) {
        iconRegistry = IIconRegistry(_registry);
    }
    
    /// @notice Get icon for a token, with fallback to chain icon
    function getTokenOrChainIcon(
        address token,
        uint256 chainId
    ) external view returns (bytes memory) {
        if (iconRegistry.hasTokenIcon(token, chainId)) {
            return iconRegistry.getIconByToken(token, chainId);
        }
        return iconRegistry.getChainIcon(chainId);
    }
}
```

## License

MIT
