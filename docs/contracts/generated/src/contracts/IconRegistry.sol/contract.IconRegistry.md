# IconRegistry
[Git Source](https://github.com/igor53627/iconregistry.eth/blob/7f58fbcb8b0f16de7ee22778491d6806e1ce855f/contracts/IconRegistry.sol)

**Inherits:**
OwnableUpgradeable, UUPSUpgradeable

**Author:**
iconregistry.eth

Upgradeable registry for on-chain PNG icons with token address and slug lookups

UUPS upgradeable contract. Must be deployed behind an ERC1967 proxy.
Icons are stored via SSTORE2 as immutable byte blobs. Each icon update creates
a new version while preserving historical versions.
PNG-only in v1 for security (no SVG XSS risk).
Trust model: Single privileged owner controls all icon content, mappings, and upgrades.
No user-submitted or permissionless data paths exist.


## State Variables
### icons
Maps slug hash to current Icon data

slugHash = keccak256(bytes(slug))


```solidity
mapping(bytes32 => Icon) public icons
```


### iconVersions
Maps slug hash and version to historical Icon data

Enables retrieval of any previous icon version


```solidity
mapping(bytes32 => mapping(uint32 => Icon)) public iconVersions
```


### tokenToIcon
Maps token address and chain ID to icon slug hash

Enables lookup like: tokenToIcon[0x...][1] => slugHash for ETH mainnet


```solidity
mapping(address => mapping(uint256 => bytes32)) public tokenToIcon
```


### chainToIcon
Maps chain ID to chain icon slug hash

Enables lookup like: chainToIcon[1] => slugHash for Ethereum icon


```solidity
mapping(uint256 => bytes32) public chainToIcon
```


### slugs
Array of all registered slug hashes for enumeration


```solidity
bytes32[] public slugs
```


### slugIndex
Maps slug hash to 1-indexed position in slugs array

0 means not registered, 1 means first element, etc.


```solidity
mapping(bytes32 => uint256) public slugIndex
```


### PNG_SIGNATURE
Full 8-byte PNG signature for strict validation


```solidity
bytes8 private constant PNG_SIGNATURE = 0x89504E470D0A1A0A
```


### __gap
Reserved storage gap for future upgrades


```solidity
uint256[50] private __gap
```


## Functions
### receive

Accept ETH donations to support the registry


```solidity
receive() external payable;
```

### withdrawETH

Withdraw accumulated ETH donations to owner

Only callable by owner. Sends entire contract balance.


```solidity
function withdrawETH() external onlyOwner;
```

### withdrawToken

Withdraw donated ERC20 tokens to owner

Only callable by owner. Sends entire token balance.


```solidity
function withdrawToken(address token) external onlyOwner;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`token`|`address`|ERC20 token contract address to withdraw|


### constructor

Disables initializers on the implementation contract to prevent
direct initialization. See OpenZeppelin upgradeable patterns.

**Note:**
oz-upgrades-unsafe-allow: constructor


```solidity
constructor() ;
```

### initialize

Initializes the IconRegistry behind a proxy

Can only be called once due to the initializer modifier.
Must be called immediately after proxy deployment.


```solidity
function initialize(address owner_) external initializer;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`owner_`|`address`|Address that will be granted the owner role|


### _authorizeUpgrade

Restricts upgrades to the contract owner


```solidity
function _authorizeUpgrade(address) internal override onlyOwner;
```

### setIcon

Add or update icon by slug

If icon exists, creates new version. Old versions remain accessible via getIconVersion.
Only PNG format is supported. Recommended max icon size: 32KB for gas efficiency.


```solidity
function setIcon(string calldata slug, bytes calldata data, uint32 width, uint32 height)
    external
    onlyOwner;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`slug`|`string`|Human-readable identifier (e.g., "protocols/uniswap", "chains/ethereum")|
|`data`|`bytes`|Raw PNG image bytes (must have valid PNG signature)|
|`width`|`uint32`|Image width in pixels|
|`height`|`uint32`|Image height in pixels|


### setIconsBatch

Batch add or update icons

For each index i, creates or updates the icon for keccak256(slugList[i]).
All arrays must have identical lengths. Only PNG format is supported.


```solidity
function setIconsBatch(
    string[] calldata slugList,
    bytes[] calldata dataList,
    uint32[] calldata widths,
    uint32[] calldata heights
) external onlyOwner;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`slugList`|`string[]`|List of slugs (e.g., "protocols/uniswap")|
|`dataList`|`bytes[]`|List of raw PNG image bytes for each slug|
|`widths`|`uint32[]`|List of image widths in pixels|
|`heights`|`uint32[]`|List of image heights in pixels|


### mapToken

Map token address to icon slug

Overwrites any existing mapping for this token+chainId pair.


```solidity
function mapToken(address token, uint256 chainId, string calldata slug) external onlyOwner;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`token`|`address`|Token contract address|
|`chainId`|`uint256`|EVM chain ID where token is deployed (e.g., 1 for Ethereum mainnet)|
|`slug`|`string`|Icon slug that must already exist in the registry|


### mapTokensBatch

Batch map tokens to icons

All arrays must have identical lengths.


```solidity
function mapTokensBatch(
    address[] calldata tokens,
    uint256[] calldata chainIds,
    string[] calldata slugList
) external onlyOwner;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`tokens`|`address[]`|List of token contract addresses|
|`chainIds`|`uint256[]`|List of chain IDs for each token|
|`slugList`|`string[]`|List of icon slugs (must exist in registry)|


### mapChain

Map chain ID to chain icon

Overwrites any existing mapping for this chainId.


```solidity
function mapChain(uint256 chainId, string calldata slug) external onlyOwner;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`chainId`|`uint256`|EVM chain ID (e.g., 1 for Ethereum, 137 for Polygon)|
|`slug`|`string`|Icon slug that must already exist in the registry|


### getIconBySlug

Get icon by slug string (latest version)


```solidity
function getIconBySlug(string calldata slug) external view returns (bytes memory);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`slug`|`string`|Human-readable slug (e.g., "protocols/uniswap")|

**Returns**

|Name|Type|Description|
|----|----|-----------|
|`<none>`|`bytes`|Raw PNG icon bytes|


### getIcon

Get icon by pre-computed slug hash (latest version)

More gas efficient when slug hash is known


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

Get icon by token address and chainId


```solidity
function getIconByToken(address token, uint256 chainId) external view returns (bytes memory);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`token`|`address`|Token contract address|
|`chainId`|`uint256`|Chain ID where token is deployed|

**Returns**

|Name|Type|Description|
|----|----|-----------|
|`<none>`|`bytes`|Raw PNG icon bytes|


### hasTokenIcon

Check if token has icon mapped


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

Get chain icon by chainId


```solidity
function getChainIcon(uint256 chainId) external view returns (bytes memory);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`chainId`|`uint256`|EVM chain ID (e.g., 1 for Ethereum)|

**Returns**

|Name|Type|Description|
|----|----|-----------|
|`<none>`|`bytes`|Raw PNG icon bytes|


### getIconDataURI

Get icon as data URI (for direct use in img src)

Returns base64-encoded PNG data URI. Gas-heavy; intended for off-chain use.


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

Get token icon as data URI

Returns base64-encoded PNG data URI. Gas-heavy; intended for off-chain use.


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

Batch get icons by slug hashes

Returns empty bytes for any missing icons (does not revert)


```solidity
function batchGetIcons(bytes32[] calldata slugHashes)
    external
    view
    returns (bytes[] memory result);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`slugHashes`|`bytes32[]`|Array of keccak256(bytes(slug)) values|

**Returns**

|Name|Type|Description|
|----|----|-----------|
|`result`|`bytes[]`|Array of PNG icon bytes (empty for missing icons)|


### batchGetTokenIcons

Batch get icons by tokens

Returns empty bytes for any unmapped tokens (does not revert).
Arrays must have identical lengths.


```solidity
function batchGetTokenIcons(address[] calldata tokens, uint256[] calldata chainIds)
    external
    view
    returns (bytes[] memory result);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`tokens`|`address[]`|Array of token contract addresses|
|`chainIds`|`uint256[]`|Array of chain IDs for each token|

**Returns**

|Name|Type|Description|
|----|----|-----------|
|`result`|`bytes[]`|Array of PNG icon bytes (empty for unmapped tokens)|


### totalIcons

Get total number of unique slugs (icons) registered


```solidity
function totalIcons() external view returns (uint256);
```
**Returns**

|Name|Type|Description|
|----|----|-----------|
|`<none>`|`uint256`|Number of icons that have been added|


### getSlugsPaginated

Get a paginated list of slug hashes


```solidity
function getSlugsPaginated(uint256 offset, uint256 limit)
    external
    view
    returns (bytes32[] memory result);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`offset`|`uint256`|Starting index in the slugs array (0-based)|
|`limit`|`uint256`|Maximum number of slug hashes to return|

**Returns**

|Name|Type|Description|
|----|----|-----------|
|`result`|`bytes32[]`|Array of slug hashes, truncated to available length|


### _hashSlug

Computes keccak256 hash of a string directly from calldata using assembly.
More gas efficient than keccak256(bytes(slug)) which copies to memory.


```solidity
function _hashSlug(string calldata slug) internal pure returns (bytes32 h);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`slug`|`string`|The string to hash|

**Returns**

|Name|Type|Description|
|----|----|-----------|
|`h`|`bytes32`|The keccak256 hash|


### _validatePNG

Validates that icon data is a valid PNG using the 8-byte PNG signature.
PNG signature: 0x89 'P' 'N' 'G' 0x0D 0x0A 0x1A 0x0A


```solidity
function _validatePNG(bytes calldata data) internal pure;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`data`|`bytes`|Raw icon bytes to validate|


### _getIconData

Retrieves icon data from SSTORE2. Reverts if icon doesn't exist.


```solidity
function _getIconData(bytes32 slugHash) internal view returns (bytes memory);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`slugHash`|`bytes32`|keccak256(bytes(slug))|

**Returns**

|Name|Type|Description|
|----|----|-----------|
|`<none>`|`bytes`|Raw PNG icon bytes|


### _base64

Base64 encodes arbitrary bytes using RFC4648 with = padding


```solidity
function _base64(bytes memory data) internal pure returns (string memory);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`data`|`bytes`|Raw bytes to encode|

**Returns**

|Name|Type|Description|
|----|----|-----------|
|`<none>`|`string`|Base64-encoded string|


## Events
### IconAdded
Emitted when a new icon is added for a slug


```solidity
event IconAdded(bytes32 indexed slugHash, string slug, address pointer, uint32 version);
```

**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`slugHash`|`bytes32`|keccak256(slug) identifying the icon|
|`slug`|`string`|Human-readable slug string (e.g., "protocols/uniswap")|
|`pointer`|`address`|SSTORE2 pointer contract where the icon bytes are stored|
|`version`|`uint32`|Version number of this icon (always 1 for new icons)|

### IconUpdated
Emitted when an existing icon is updated to a new version


```solidity
event IconUpdated(bytes32 indexed slugHash, string slug, address pointer, uint32 version);
```

**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`slugHash`|`bytes32`|keccak256(slug) identifying the icon|
|`slug`|`string`|Human-readable slug string|
|`pointer`|`address`|SSTORE2 pointer contract where the new icon bytes are stored|
|`version`|`uint32`|New version number (previous version + 1)|

### TokenMapped
Emitted when a token is mapped to an icon slug


```solidity
event TokenMapped(address indexed token, uint256 indexed chainId, bytes32 slugHash);
```

**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`token`|`address`|Token contract address|
|`chainId`|`uint256`|Chain ID where the token is deployed|
|`slugHash`|`bytes32`|keccak256(slug) of the mapped icon|

### ChainMapped
Emitted when a chain ID is mapped to a chain icon


```solidity
event ChainMapped(uint256 indexed chainId, bytes32 slugHash);
```

**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`chainId`|`uint256`|Chain ID (e.g., 1 for Ethereum mainnet)|
|`slugHash`|`bytes32`|keccak256(slug) of the mapped chain icon|

## Errors
### IconNotFound
Thrown when an icon is requested for a slug that has not been registered


```solidity
error IconNotFound();
```

### InvalidData
Thrown when provided data is invalid (empty bytes, mismatched array lengths)


```solidity
error InvalidData();
```

### VersionNotFound
Thrown when a requested icon version does not exist


```solidity
error VersionNotFound();
```

### TransferFailed
Thrown when ETH or token transfer fails


```solidity
error TransferFailed();
```

### LengthMismatch
Thrown when batch arrays have mismatched lengths


```solidity
error LengthMismatch();
```

### InvalidPNG
Thrown when icon data is not a valid PNG (magic byte mismatch)


```solidity
error InvalidPNG();
```

## Structs
### Icon
Icon data stored via SSTORE2


```solidity
struct Icon {
    address pointer;
    uint32 width;
    uint32 height;
    uint32 version;
}
```

**Properties**

|Name|Type|Description|
|----|----|-----------|
|`pointer`|`address`|SSTORE2 pointer contract address where icon bytes are stored|
|`width`|`uint32`|Image width in pixels|
|`height`|`uint32`|Image height in pixels|
|`version`|`uint32`|Version number (starts at 1, increments on each update)|

