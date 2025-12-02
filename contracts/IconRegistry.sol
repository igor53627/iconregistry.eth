// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import {SSTORE2} from "solady/utils/SSTORE2.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title IconRegistry
/// @author iconregistry.eth
/// @notice Upgradeable registry for on-chain PNG icons with token address and slug lookups
/// @dev UUPS upgradeable contract. Must be deployed behind an ERC1967 proxy.
///      Icons are stored via SSTORE2 as immutable byte blobs. Each icon update creates
///      a new version while preserving historical versions.
///      
///      PNG-only in v1 for security (no SVG XSS risk).
///      
///      Trust model: Single privileged owner controls all icon content, mappings, and upgrades.
///      No user-submitted or permissionless data paths exist.
contract IconRegistry is OwnableUpgradeable, UUPSUpgradeable {
    using SafeERC20 for IERC20;

    /// @notice Icon data stored via SSTORE2
    /// @param pointer SSTORE2 pointer contract address where icon bytes are stored
    /// @param width Image width in pixels
    /// @param height Image height in pixels
    /// @param version Version number (starts at 1, increments on each update)
    struct Icon {
        address pointer;
        uint32 width;
        uint32 height;
        uint32 version;
    }

    /// @notice Maps slug hash to current Icon data
    /// @dev slugHash = keccak256(bytes(slug))
    mapping(bytes32 => Icon) public icons;

    /// @notice Maps slug hash and version to historical Icon data
    /// @dev Enables retrieval of any previous icon version
    mapping(bytes32 => mapping(uint32 => Icon)) public iconVersions;

    /// @notice Maps token address and chain ID to icon slug hash
    /// @dev Enables lookup like: tokenToIcon[0x...][1] => slugHash for ETH mainnet
    mapping(address => mapping(uint256 => bytes32)) public tokenToIcon;

    /// @notice Maps chain ID to chain icon slug hash
    /// @dev Enables lookup like: chainToIcon[1] => slugHash for Ethereum icon
    mapping(uint256 => bytes32) public chainToIcon;

    /// @notice Array of all registered slug hashes for enumeration
    bytes32[] public slugs;

    /// @notice Maps slug hash to 1-indexed position in slugs array
    /// @dev 0 means not registered, 1 means first element, etc.
    mapping(bytes32 => uint256) public slugIndex;

    /// @notice Emitted when a new icon is added for a slug
    /// @param slugHash keccak256(slug) identifying the icon
    /// @param slug Human-readable slug string (e.g., "protocols/uniswap")
    /// @param pointer SSTORE2 pointer contract where the icon bytes are stored
    /// @param version Version number of this icon (always 1 for new icons)
    event IconAdded(bytes32 indexed slugHash, string slug, address pointer, uint32 version);

    /// @notice Emitted when an existing icon is updated to a new version
    /// @param slugHash keccak256(slug) identifying the icon
    /// @param slug Human-readable slug string
    /// @param pointer SSTORE2 pointer contract where the new icon bytes are stored
    /// @param version New version number (previous version + 1)
    event IconUpdated(bytes32 indexed slugHash, string slug, address pointer, uint32 version);

    /// @notice Emitted when a token is mapped to an icon slug
    /// @param token Token contract address
    /// @param chainId Chain ID where the token is deployed
    /// @param slugHash keccak256(slug) of the mapped icon
    event TokenMapped(address indexed token, uint256 indexed chainId, bytes32 slugHash);

    /// @notice Emitted when a chain ID is mapped to a chain icon
    /// @param chainId Chain ID (e.g., 1 for Ethereum mainnet)
    /// @param slugHash keccak256(slug) of the mapped chain icon
    event ChainMapped(uint256 indexed chainId, bytes32 slugHash);

    /// @notice Thrown when an icon is requested for a slug that has not been registered
    error IconNotFound();

    /// @notice Thrown when provided data is invalid (empty bytes, mismatched array lengths)
    error InvalidData();

    /// @notice Thrown when a requested icon version does not exist
    error VersionNotFound();

    /// @notice Thrown when ETH or token transfer fails
    error TransferFailed();

    /// @notice Thrown when batch arrays have mismatched lengths
    error LengthMismatch();

    /// @notice Thrown when icon data is not a valid PNG (magic byte mismatch)
    error InvalidPNG();

    /// @dev Full 8-byte PNG signature for strict validation
    bytes8 private constant PNG_SIGNATURE = 0x89504E470D0A1A0A;

    // ========== DONATIONS ==========

    /// @notice Accept ETH donations to support the registry
    receive() external payable {}

    /// @notice Withdraw accumulated ETH donations to owner
    /// @dev Only callable by owner. Sends entire contract balance.
    function withdrawETH() external onlyOwner {
        (bool success,) = payable(owner()).call{value: address(this).balance}("");
        if (!success) revert TransferFailed();
    }

    /// @notice Withdraw donated ERC20 tokens to owner
    /// @dev Only callable by owner. Sends entire token balance.
    ///      Uses SafeERC20 to handle non-standard tokens (USDT, etc.)
    /// @param token ERC20 token contract address to withdraw
    function withdrawToken(address token) external onlyOwner {
        uint256 balance = IERC20(token).balanceOf(address(this));
        IERC20(token).safeTransfer(owner(), balance);
    }

    // ========== INITIALIZATION ==========

    /// @dev Disables initializers on the implementation contract to prevent
    ///      direct initialization. See OpenZeppelin upgradeable patterns.
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /// @notice Initializes the IconRegistry behind a proxy
    /// @dev Can only be called once due to the initializer modifier.
    ///      Must be called immediately after proxy deployment.
    /// @param owner_ Address that will be granted the owner role
    function initialize(address owner_) external initializer {
        __Ownable_init(owner_);
    }

    /// @dev Restricts upgrades to the contract owner
    /// @inheritdoc UUPSUpgradeable
    function _authorizeUpgrade(address) internal override onlyOwner {}

    // ========== ADMIN: Add/Update Icons ==========

    /// @notice Add or update icon by slug
    /// @dev If icon exists, creates new version. Old versions remain accessible via getIconVersion.
    ///      Only PNG format is supported. Recommended max icon size: 32KB for gas efficiency.
    /// @param slug Human-readable identifier (e.g., "protocols/uniswap", "chains/ethereum")
    /// @param data Raw PNG image bytes (must have valid PNG signature)
    /// @param width Image width in pixels
    /// @param height Image height in pixels
    function setIcon(
        string calldata slug,
        bytes calldata data,
        uint32 width,
        uint32 height
    ) external onlyOwner {
        bytes32 slugHash = _hashSlug(slug);
        if (data.length == 0) revert InvalidData();
        _validatePNG(data);

        address pointer = SSTORE2.write(data);
        Icon storage current = icons[slugHash];

        if (current.pointer == address(0)) {
            icons[slugHash] = Icon(pointer, width, height, 1);
            iconVersions[slugHash][1] = icons[slugHash];

            slugs.push(slugHash);
            slugIndex[slugHash] = slugs.length;

            emit IconAdded(slugHash, slug, pointer, 1);
        } else {
            uint32 newVersion = current.version + 1;
            icons[slugHash] = Icon(pointer, width, height, newVersion);
            iconVersions[slugHash][newVersion] = icons[slugHash];

            emit IconUpdated(slugHash, slug, pointer, newVersion);
        }
    }

    /// @notice Batch add or update icons
    /// @dev For each index i, creates or updates the icon for keccak256(slugList[i]).
    ///      All arrays must have identical lengths. Only PNG format is supported.
    /// @param slugList List of slugs (e.g., "protocols/uniswap")
    /// @param dataList List of raw PNG image bytes for each slug
    /// @param widths List of image widths in pixels
    /// @param heights List of image heights in pixels
    function setIconsBatch(
        string[] calldata slugList,
        bytes[] calldata dataList,
        uint32[] calldata widths,
        uint32[] calldata heights
    ) external onlyOwner {
        uint256 len = slugList.length;
        if (dataList.length != len || widths.length != len || heights.length != len) {
            revert LengthMismatch();
        }

        for (uint256 i = 0; i < len;) {
            bytes32 slugHash = _hashSlug(slugList[i]);
            if (dataList[i].length == 0) revert InvalidData();
            _validatePNG(dataList[i]);

            address pointer = SSTORE2.write(dataList[i]);
            Icon storage current = icons[slugHash];

            if (current.pointer == address(0)) {
                icons[slugHash] = Icon(pointer, widths[i], heights[i], 1);
                iconVersions[slugHash][1] = icons[slugHash];

                slugs.push(slugHash);
                slugIndex[slugHash] = slugs.length;

                emit IconAdded(slugHash, slugList[i], pointer, 1);
            } else {
                uint32 newVersion = current.version + 1;
                icons[slugHash] = Icon(pointer, widths[i], heights[i], newVersion);
                iconVersions[slugHash][newVersion] = icons[slugHash];

                emit IconUpdated(slugHash, slugList[i], pointer, newVersion);
            }

            unchecked { ++i; }
        }
    }

    // ========== ADMIN: Map Tokens/Chains ==========

    /// @notice Map token address to icon slug
    /// @dev Overwrites any existing mapping for this token+chainId pair.
    /// @param token Token contract address
    /// @param chainId EVM chain ID where token is deployed (e.g., 1 for Ethereum mainnet)
    /// @param slug Icon slug that must already exist in the registry
    function mapToken(address token, uint256 chainId, string calldata slug) external onlyOwner {
        bytes32 slugHash = _hashSlug(slug);
        if (icons[slugHash].pointer == address(0)) revert IconNotFound();
        tokenToIcon[token][chainId] = slugHash;
        emit TokenMapped(token, chainId, slugHash);
    }

    /// @notice Batch map tokens to icons
    /// @dev All arrays must have identical lengths.
    /// @param tokens List of token contract addresses
    /// @param chainIds List of chain IDs for each token
    /// @param slugList List of icon slugs (must exist in registry)
    function mapTokensBatch(
        address[] calldata tokens,
        uint256[] calldata chainIds,
        string[] calldata slugList
    ) external onlyOwner {
        uint256 len = tokens.length;
        if (chainIds.length != len || slugList.length != len) {
            revert LengthMismatch();
        }

        for (uint256 i = 0; i < len;) {
            bytes32 slugHash = _hashSlug(slugList[i]);
            if (icons[slugHash].pointer == address(0)) revert IconNotFound();
            tokenToIcon[tokens[i]][chainIds[i]] = slugHash;
            emit TokenMapped(tokens[i], chainIds[i], slugHash);

            unchecked { ++i; }
        }
    }

    /// @notice Map chain ID to chain icon
    /// @dev Overwrites any existing mapping for this chainId.
    /// @param chainId EVM chain ID (e.g., 1 for Ethereum, 137 for Polygon)
    /// @param slug Icon slug that must already exist in the registry
    function mapChain(uint256 chainId, string calldata slug) external onlyOwner {
        bytes32 slugHash = _hashSlug(slug);
        if (icons[slugHash].pointer == address(0)) revert IconNotFound();
        chainToIcon[chainId] = slugHash;
        emit ChainMapped(chainId, slugHash);
    }

    // ========== GETTERS: By Slug ==========

    /// @notice Get icon by slug string (latest version)
    /// @param slug Human-readable slug (e.g., "protocols/uniswap")
    /// @return Raw PNG icon bytes
    function getIconBySlug(string calldata slug) external view returns (bytes memory) {
        bytes32 slugHash = _hashSlug(slug);
        return _getIconData(slugHash);
    }

    /// @notice Get icon by pre-computed slug hash (latest version)
    /// @dev More gas efficient when slug hash is known
    /// @param slugHash keccak256(bytes(slug))
    /// @return Raw PNG icon bytes
    function getIcon(bytes32 slugHash) external view returns (bytes memory) {
        return _getIconData(slugHash);
    }

    /// @notice Get specific version of an icon
    /// @param slugHash keccak256(bytes(slug))
    /// @param version Version number (1-indexed)
    /// @return Raw PNG icon bytes for that version
    function getIconVersion(bytes32 slugHash, uint32 version) external view returns (bytes memory) {
        Icon storage icon = iconVersions[slugHash][version];
        if (icon.pointer == address(0)) revert VersionNotFound();
        return SSTORE2.read(icon.pointer);
    }

    /// @notice Get current version number for a slug
    /// @param slugHash keccak256(bytes(slug))
    /// @return Current version number (1 or higher)
    function getCurrentVersion(bytes32 slugHash) external view returns (uint32) {
        Icon storage icon = icons[slugHash];
        if (icon.pointer == address(0)) revert IconNotFound();
        return icon.version;
    }

    /// @notice Get icon metadata including version
    /// @param slugHash keccak256(bytes(slug))
    /// @return pointer SSTORE2 pointer address
    /// @return width Image width in pixels
    /// @return height Image height in pixels
    /// @return version Current version number
    function getIconInfo(bytes32 slugHash)
        external
        view
        returns (address pointer, uint32 width, uint32 height, uint32 version)
    {
        Icon storage icon = icons[slugHash];
        if (icon.pointer == address(0)) revert IconNotFound();
        return (icon.pointer, icon.width, icon.height, icon.version);
    }

    // ========== GETTERS: By Token ==========

    /// @notice Get icon by token address and chainId
    /// @param token Token contract address
    /// @param chainId Chain ID where token is deployed
    /// @return Raw PNG icon bytes
    function getIconByToken(address token, uint256 chainId) external view returns (bytes memory) {
        bytes32 slugHash = tokenToIcon[token][chainId];
        if (slugHash == bytes32(0)) revert IconNotFound();
        return _getIconData(slugHash);
    }

    /// @notice Check if token has icon mapped
    /// @param token Token contract address
    /// @param chainId Chain ID where token is deployed
    /// @return True if an icon is mapped for this token+chainId
    function hasTokenIcon(address token, uint256 chainId) external view returns (bool) {
        return tokenToIcon[token][chainId] != bytes32(0);
    }

    // ========== GETTERS: By Chain ==========

    /// @notice Get chain icon by chainId
    /// @param chainId EVM chain ID (e.g., 1 for Ethereum)
    /// @return Raw PNG icon bytes
    function getChainIcon(uint256 chainId) external view returns (bytes memory) {
        bytes32 slugHash = chainToIcon[chainId];
        if (slugHash == bytes32(0)) revert IconNotFound();
        return _getIconData(slugHash);
    }

    // ========== GETTERS: Data URI ==========

    /// @notice Get icon as data URI (for direct use in img src)
    /// @dev Returns base64-encoded PNG data URI. Gas-heavy; intended for off-chain use.
    /// @param slugHash keccak256(bytes(slug))
    /// @return Data URI string (e.g., "data:image/png;base64,...")
    function getIconDataURI(bytes32 slugHash) external view returns (string memory) {
        Icon storage icon = icons[slugHash];
        if (icon.pointer == address(0)) revert IconNotFound();

        bytes memory data = SSTORE2.read(icon.pointer);
        return string(abi.encodePacked("data:image/png;base64,", _base64(data)));
    }

    /// @notice Get token icon as data URI
    /// @dev Returns base64-encoded PNG data URI. Gas-heavy; intended for off-chain use.
    /// @param token Token contract address
    /// @param chainId Chain ID where token is deployed
    /// @return Data URI string
    function getTokenIconDataURI(address token, uint256 chainId)
        external
        view
        returns (string memory)
    {
        bytes32 slugHash = tokenToIcon[token][chainId];
        if (slugHash == bytes32(0)) revert IconNotFound();

        Icon storage icon = icons[slugHash];
        bytes memory data = SSTORE2.read(icon.pointer);
        return string(abi.encodePacked("data:image/png;base64,", _base64(data)));
    }

    // ========== GETTERS: Batch ==========

    /// @notice Batch get icons by slug hashes
    /// @dev Returns empty bytes for any missing icons (does not revert)
    /// @param slugHashes Array of keccak256(bytes(slug)) values
    /// @return result Array of PNG icon bytes (empty for missing icons)
    function batchGetIcons(bytes32[] calldata slugHashes)
        external
        view
        returns (bytes[] memory result)
    {
        result = new bytes[](slugHashes.length);
        for (uint256 i = 0; i < slugHashes.length;) {
            Icon storage icon = icons[slugHashes[i]];
            if (icon.pointer != address(0)) {
                result[i] = SSTORE2.read(icon.pointer);
            }
            unchecked { ++i; }
        }
    }

    /// @notice Batch get icons by tokens
    /// @dev Returns empty bytes for any unmapped tokens (does not revert).
    ///      Arrays must have identical lengths.
    /// @param tokens Array of token contract addresses
    /// @param chainIds Array of chain IDs for each token
    /// @return result Array of PNG icon bytes (empty for unmapped tokens)
    function batchGetTokenIcons(address[] calldata tokens, uint256[] calldata chainIds)
        external
        view
        returns (bytes[] memory result)
    {
        uint256 len = tokens.length;
        if (chainIds.length != len) revert LengthMismatch();

        result = new bytes[](len);
        for (uint256 i = 0; i < len;) {
            bytes32 slugHash = tokenToIcon[tokens[i]][chainIds[i]];
            if (slugHash != bytes32(0)) {
                Icon storage icon = icons[slugHash];
                if (icon.pointer != address(0)) {
                    result[i] = SSTORE2.read(icon.pointer);
                }
            }
            unchecked { ++i; }
        }
    }

    // ========== ENUMERATION ==========

    /// @notice Get total number of unique slugs (icons) registered
    /// @return Number of icons that have been added
    function totalIcons() external view returns (uint256) {
        return slugs.length;
    }

    /// @notice Get a paginated list of slug hashes
    /// @param offset Starting index in the slugs array (0-based)
    /// @param limit Maximum number of slug hashes to return
    /// @return result Array of slug hashes, truncated to available length
    function getSlugsPaginated(uint256 offset, uint256 limit)
        external
        view
        returns (bytes32[] memory result)
    {
        uint256 total = slugs.length;
        if (offset >= total) return new bytes32[](0);

        uint256 end = offset + limit > total ? total : offset + limit;
        result = new bytes32[](end - offset);
        for (uint256 i = offset; i < end;) {
            result[i - offset] = slugs[i];
            unchecked { ++i; }
        }
    }

    // ========== INTERNAL ==========

    /// @dev Computes keccak256 hash of a string directly from calldata using assembly.
    ///      More gas efficient than keccak256(bytes(slug)) which copies to memory.
    /// @param slug The string to hash
    /// @return h The keccak256 hash
    function _hashSlug(string calldata slug) internal pure returns (bytes32 h) {
        assembly {
            let ptr := mload(0x40)
            calldatacopy(ptr, slug.offset, slug.length)
            h := keccak256(ptr, slug.length)
        }
    }

    /// @dev Validates that icon data is a valid PNG using the 8-byte PNG signature.
    ///      PNG signature: 0x89 'P' 'N' 'G' 0x0D 0x0A 0x1A 0x0A
    /// @param data Raw icon bytes to validate
    function _validatePNG(bytes calldata data) internal pure {
        if (data.length < 8) revert InvalidPNG();
        if (bytes8(data[:8]) != PNG_SIGNATURE) revert InvalidPNG();
    }

    /// @dev Retrieves icon data from SSTORE2. Reverts if icon doesn't exist.
    /// @param slugHash keccak256(bytes(slug))
    /// @return Raw PNG icon bytes
    function _getIconData(bytes32 slugHash) internal view returns (bytes memory) {
        Icon storage icon = icons[slugHash];
        if (icon.pointer == address(0)) revert IconNotFound();
        return SSTORE2.read(icon.pointer);
    }

    /// @dev Base64 encodes arbitrary bytes using RFC4648 with = padding
    /// @param data Raw bytes to encode
    /// @return Base64-encoded string
    function _base64(bytes memory data) internal pure returns (string memory) {
        bytes memory TABLE = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
        uint256 len = data.length;
        if (len == 0) return "";

        uint256 encodedLen = 4 * ((len + 2) / 3);
        bytes memory result = new bytes(encodedLen);

        uint256 i = 0;
        uint256 j = 0;

        while (i < len) {
            uint256 a = i < len ? uint8(data[i++]) : 0;
            uint256 b = i < len ? uint8(data[i++]) : 0;
            uint256 c = i < len ? uint8(data[i++]) : 0;
            uint256 triple = (a << 16) | (b << 8) | c;

            result[j++] = TABLE[(triple >> 18) & 0x3F];
            result[j++] = TABLE[(triple >> 12) & 0x3F];
            result[j++] = TABLE[(triple >> 6) & 0x3F];
            result[j++] = TABLE[triple & 0x3F];
        }

        if (len % 3 == 1) {
            result[encodedLen - 1] = "=";
            result[encodedLen - 2] = "=";
        } else if (len % 3 == 2) {
            result[encodedLen - 1] = "=";
        }

        return string(result);
    }

    /// @dev Reserved storage gap for future upgrades
    uint256[50] private __gap;
}
