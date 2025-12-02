# IIconRegistry
[Git Source](https://github.com/igor53627/iconregistry.eth/blob/32c020049bea8491e0385d0073eb17d6d35abf4c/contracts/IIconRegistry.sol)

**Title:**
IIconRegistry

**Author:**
iconregistry.eth

Interface for the on-chain PNG icon registry

Stable ABI for integrators. All icon data is stored via SSTORE2.
PNG-only in v1 for security.


## Functions
### getIconBySlug

Get icon by slug string (e.g., "protocols/uniswap")


```solidity
function getIconBySlug(string calldata slug) external view returns (bytes memory);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`slug`|`string`|Human-readable identifier for the icon|

**Returns**

|Name|Type|Description|
|----|----|-----------|
|`<none>`|`bytes`|Raw PNG icon bytes|


### getIcon

Get icon by pre-computed keccak256(slug)

More gas efficient when slug hash is already known


```solidity
function getIcon(bytes32 slugHash) external view returns (bytes memory);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`slugHash`|`bytes32`|keccak256(bytes(slug))|

**Returns**

|Name|Type|Description|
|----|----|-----------|
|`<none>`|`bytes`|Raw PNG icon bytes|


### getIconVersion

Get specific version of an icon


```solidity
function getIconVersion(bytes32 slugHash, uint32 version) external view returns (bytes memory);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`slugHash`|`bytes32`|keccak256(bytes(slug))|
|`version`|`uint32`|Version number (1-indexed)|

**Returns**

|Name|Type|Description|
|----|----|-----------|
|`<none>`|`bytes`|Raw PNG icon bytes for that version|


### getCurrentVersion

Get current version number for a slug


```solidity
function getCurrentVersion(bytes32 slugHash) external view returns (uint32);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`slugHash`|`bytes32`|keccak256(bytes(slug))|

**Returns**

|Name|Type|Description|
|----|----|-----------|
|`<none>`|`uint32`|Current version number (1 or higher)|


### getIconInfo

Get icon metadata including version


```solidity
function getIconInfo(bytes32 slugHash)
    external
    view
    returns (address pointer, uint32 width, uint32 height, uint32 version);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`slugHash`|`bytes32`|keccak256(bytes(slug))|

**Returns**

|Name|Type|Description|
|----|----|-----------|
|`pointer`|`address`|SSTORE2 pointer address|
|`width`|`uint32`|Image width in pixels|
|`height`|`uint32`|Image height in pixels|
|`version`|`uint32`|Current version number|


### getIconByToken

Get icon by token contract address


```solidity
function getIconByToken(address token, uint256 chainId) external view returns (bytes memory);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`token`|`address`|Token contract address|
|`chainId`|`uint256`|Chain ID where token is deployed (e.g., 1 for Ethereum mainnet)|

**Returns**

|Name|Type|Description|
|----|----|-----------|
|`<none>`|`bytes`|Raw PNG icon bytes|


### hasTokenIcon

Check if token has an icon mapped


```solidity
function hasTokenIcon(address token, uint256 chainId) external view returns (bool);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`token`|`address`|Token contract address|
|`chainId`|`uint256`|Chain ID where token is deployed|

**Returns**

|Name|Type|Description|
|----|----|-----------|
|`<none>`|`bool`|True if an icon is mapped for this token+chainId|


### getChainIcon

Get chain icon by chain ID (e.g., 1 for Ethereum)


```solidity
function getChainIcon(uint256 chainId) external view returns (bytes memory);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`chainId`|`uint256`|EVM chain ID|

**Returns**

|Name|Type|Description|
|----|----|-----------|
|`<none>`|`bytes`|Raw PNG icon bytes|


### getIconDataURI

Get icon as base64 PNG data URI for direct use in <img src="">

Gas-heavy; intended for off-chain use


```solidity
function getIconDataURI(bytes32 slugHash) external view returns (string memory);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`slugHash`|`bytes32`|keccak256(bytes(slug))|

**Returns**

|Name|Type|Description|
|----|----|-----------|
|`<none>`|`string`|Data URI string (e.g., "data:image/png;base64,...")|


### getTokenIconDataURI

Get token icon as PNG data URI

Gas-heavy; intended for off-chain use


```solidity
function getTokenIconDataURI(address token, uint256 chainId)
    external
    view
    returns (string memory);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`token`|`address`|Token contract address|
|`chainId`|`uint256`|Chain ID where token is deployed|

**Returns**

|Name|Type|Description|
|----|----|-----------|
|`<none>`|`string`|Data URI string|


### batchGetIcons

Get multiple icons by slug hashes

Returns empty bytes for any missing icons (does not revert)


```solidity
function batchGetIcons(bytes32[] calldata slugHashes) external view returns (bytes[] memory);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`slugHashes`|`bytes32[]`|Array of keccak256(bytes(slug)) values|

**Returns**

|Name|Type|Description|
|----|----|-----------|
|`<none>`|`bytes[]`|Array of PNG icon bytes (empty for missing icons)|


### batchGetTokenIcons

Get multiple icons by token addresses

Returns empty bytes for any unmapped tokens (does not revert)


```solidity
function batchGetTokenIcons(address[] calldata tokens, uint256[] calldata chainIds)
    external
    view
    returns (bytes[] memory);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`tokens`|`address[]`|Array of token contract addresses|
|`chainIds`|`uint256[]`|Array of chain IDs for each token|

**Returns**

|Name|Type|Description|
|----|----|-----------|
|`<none>`|`bytes[]`|Array of PNG icon bytes (empty for unmapped tokens)|


### totalIcons

Get total number of unique icons registered


```solidity
function totalIcons() external view returns (uint256);
```
**Returns**

|Name|Type|Description|
|----|----|-----------|
|`<none>`|`uint256`|Number of icons|


## Errors
### IconNotFound
Thrown when an icon is requested for a slug that has not been registered


```solidity
error IconNotFound();
```

### VersionNotFound
Thrown when a requested icon version does not exist


```solidity
error VersionNotFound();
```

