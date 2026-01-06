// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import {SSTORE2} from "solady/utils/SSTORE2.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title IconRegistry
/// @author iconregistry.eth
/// @notice Upgradeable registry for on-chain PNG and SVG icons with token address and slug lookups
/// @dev UUPS upgradeable contract. Must be deployed behind an ERC1967 proxy.
///      Icons are stored via SSTORE2 as immutable byte blobs. Each icon update creates
///      a new version while preserving historical versions.
///      
///      V2 adds SVG support alongside PNG. SVG security relies on off-chain sanitization
///      (SVGO) and safe rendering practices (use <img src> only, never innerHTML).
///      On-chain validation is minimal (checks for <svg tag presence).
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

    // ========== V2: SVG SUPPORT ==========

    /// @notice Icon format enum for getBestIcon helpers
    enum IconFormat { None, PNG, SVG }

    /// @notice Maps slug hash to current SVG Icon data
    /// @dev slugHash = keccak256(bytes(slug))
    mapping(bytes32 => Icon) public svgIcons;

    /// @notice Maps slug hash and version to historical SVG Icon data
    /// @dev Enables retrieval of any previous SVG icon version
    mapping(bytes32 => mapping(uint32 => Icon)) public svgIconVersions;

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

    /// @notice Emitted when ETH is withdrawn from the contract
    /// @param to Recipient address (owner)
    /// @param amount Amount of ETH withdrawn in wei
    event ETHWithdrawn(address indexed to, uint256 amount);

    /// @notice Emitted when ERC20 tokens are withdrawn from the contract
    /// @param token Token contract address
    /// @param to Recipient address (owner)
    /// @param amount Amount of tokens withdrawn
    event TokenWithdrawn(address indexed token, address indexed to, uint256 amount);

    /// @notice Thrown when an icon is requested for a slug that has not been registered
    /// @param slugHash The keccak256 hash of the slug that was not found
    error IconNotFound(bytes32 slugHash);

    /// @notice Thrown when a token has no icon mapping for the given chainId
    /// @param token The token address that was queried
    /// @param chainId The chain ID that was queried
    error TokenIconNotMapped(address token, uint256 chainId);

    /// @notice Thrown when a chain has no icon mapping
    /// @param chainId The chain ID that was queried
    error ChainIconNotMapped(uint256 chainId);

    /// @notice Thrown when provided data is invalid (empty bytes)
    /// @param slug The slug for which invalid data was provided
    error InvalidData(string slug);

    /// @notice Thrown when a requested icon version does not exist
    /// @param slugHash The keccak256 hash of the slug
    /// @param version The version that was requested
    error VersionNotFound(bytes32 slugHash, uint256 version);

    /// @notice Thrown when ETH or token transfer fails
    error TransferFailed();

    /// @notice Thrown when batch arrays have mismatched lengths
    /// @param expected The expected array length
    /// @param got The actual array length received
    error LengthMismatch(uint256 expected, uint256 got);

    /// @notice Thrown when icon data is not a valid PNG (magic byte mismatch)
    error InvalidPNG();

    /// @notice Thrown when icon data is not a valid SVG (missing <svg tag)
    error InvalidSVG();

    /// @notice Thrown when no icon exists in any format for a slug
    /// @param slugHash The keccak256 hash of the slug that was not found
    error NoIconAvailable(bytes32 slugHash);

    /// @dev Full 8-byte PNG signature for strict validation
    bytes8 private constant PNG_SIGNATURE = 0x89504E470D0A1A0A;

    /// @dev Maximum allowed SVG size in bytes (32KB)
    uint256 private constant MAX_SVG_SIZE = 32768;

    // ========== DONATIONS ==========

    /// @notice Accept ETH donations to support the registry
    receive() external payable {}

    /// @notice Withdraw accumulated ETH donations to owner
    /// @dev Only callable by owner. Sends entire contract balance.
    function withdrawETH() external onlyOwner {
        address o = owner();
        uint256 amount = address(this).balance;
        (bool success,) = payable(o).call{value: amount}("");
        if (!success) revert TransferFailed();
        emit ETHWithdrawn(o, amount);
    }

    /// @notice Withdraw donated ERC20 tokens to owner
    /// @dev Only callable by owner. Sends entire token balance.
    ///      Uses SafeERC20 to handle non-standard tokens (USDT, etc.)
    /// @param token ERC20 token contract address to withdraw
    function withdrawToken(address token) external onlyOwner {
        address o = owner();
        uint256 balance = IERC20(token).balanceOf(address(this));
        IERC20(token).safeTransfer(o, balance);
        emit TokenWithdrawn(token, o, balance);
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
        if (data.length == 0) revert InvalidData(slug);
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
        if (dataList.length != len) {
            revert LengthMismatch(len, dataList.length);
        }
        if (widths.length != len) {
            revert LengthMismatch(len, widths.length);
        }
        if (heights.length != len) {
            revert LengthMismatch(len, heights.length);
        }

        for (uint256 i = 0; i < len;) {
            bytes32 slugHash = _hashSlug(slugList[i]);
            if (dataList[i].length == 0) revert InvalidData(slugList[i]);
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

    // ========== ADMIN: Add/Update SVG Icons (V2) ==========

    /// @notice Add or update SVG icon by slug
    /// @dev If SVG icon exists, creates new version. Old versions remain accessible via getSvgIconVersion.
    ///      SVG validation is minimal (checks for <svg tag). Off-chain sanitization is required.
    ///      Maximum SVG size: 32KB.
    /// @param slug Human-readable identifier (e.g., "tokens/aave", "networks/ethereum")
    /// @param data Raw SVG image bytes (must contain <svg tag)
    /// @param width Image width in pixels (for metadata)
    /// @param height Image height in pixels (for metadata)
    function setSvgIcon(
        string calldata slug,
        bytes calldata data,
        uint32 width,
        uint32 height
    ) external onlyOwner {
        bytes32 slugHash = _hashSlug(slug);
        if (data.length == 0) revert InvalidData(slug);
        _validateSVG(data);

        address pointer = SSTORE2.write(data);
        Icon storage current = svgIcons[slugHash];

        if (current.pointer == address(0)) {
            svgIcons[slugHash] = Icon(pointer, width, height, 1);
            svgIconVersions[slugHash][1] = svgIcons[slugHash];

            if (slugIndex[slugHash] == 0) {
                slugs.push(slugHash);
                slugIndex[slugHash] = slugs.length;
            }

            emit IconAdded(slugHash, slug, pointer, 1);
        } else {
            uint32 newVersion = current.version + 1;
            svgIcons[slugHash] = Icon(pointer, width, height, newVersion);
            svgIconVersions[slugHash][newVersion] = svgIcons[slugHash];

            emit IconUpdated(slugHash, slug, pointer, newVersion);
        }
    }

    /// @notice Batch add or update SVG icons
    /// @dev For each index i, creates or updates the SVG icon for keccak256(slugList[i]).
    ///      All arrays must have identical lengths. Maximum SVG size: 32KB each.
    /// @param slugList List of slugs (e.g., "tokens/aave")
    /// @param dataList List of raw SVG image bytes for each slug
    /// @param widths List of image widths in pixels
    /// @param heights List of image heights in pixels
    function setSvgIconsBatch(
        string[] calldata slugList,
        bytes[] calldata dataList,
        uint32[] calldata widths,
        uint32[] calldata heights
    ) external onlyOwner {
        uint256 len = slugList.length;
        if (dataList.length != len) {
            revert LengthMismatch(len, dataList.length);
        }
        if (widths.length != len) {
            revert LengthMismatch(len, widths.length);
        }
        if (heights.length != len) {
            revert LengthMismatch(len, heights.length);
        }

        for (uint256 i = 0; i < len;) {
            bytes32 slugHash = _hashSlug(slugList[i]);
            if (dataList[i].length == 0) revert InvalidData(slugList[i]);
            _validateSVG(dataList[i]);

            address pointer = SSTORE2.write(dataList[i]);
            Icon storage current = svgIcons[slugHash];

            if (current.pointer == address(0)) {
                svgIcons[slugHash] = Icon(pointer, widths[i], heights[i], 1);
                svgIconVersions[slugHash][1] = svgIcons[slugHash];

                if (slugIndex[slugHash] == 0) {
                    slugs.push(slugHash);
                    slugIndex[slugHash] = slugs.length;
                }

                emit IconAdded(slugHash, slugList[i], pointer, 1);
            } else {
                uint32 newVersion = current.version + 1;
                svgIcons[slugHash] = Icon(pointer, widths[i], heights[i], newVersion);
                svgIconVersions[slugHash][newVersion] = svgIcons[slugHash];

                emit IconUpdated(slugHash, slugList[i], pointer, newVersion);
            }

            unchecked { ++i; }
        }
    }

    // ========== ADMIN: Map Tokens/Chains ==========

    /// @notice Map token address to icon slug
    /// @dev Overwrites any existing mapping for this token+chainId pair.
    ///      V2: Accepts slugs with either PNG or SVG icons.
    /// @param token Token contract address
    /// @param chainId EVM chain ID where token is deployed (e.g., 1 for Ethereum mainnet)
    /// @param slug Icon slug that must already exist in the registry (PNG or SVG)
    function mapToken(address token, uint256 chainId, string calldata slug) external onlyOwner {
        bytes32 slugHash = _hashSlug(slug);
        if (!_hasAnyIcon(slugHash)) revert NoIconAvailable(slugHash);
        tokenToIcon[token][chainId] = slugHash;
        emit TokenMapped(token, chainId, slugHash);
    }

    /// @notice Batch map tokens to icons
    /// @dev All arrays must have identical lengths.
    ///      V2: Accepts slugs with either PNG or SVG icons.
    /// @param tokens List of token contract addresses
    /// @param chainIds List of chain IDs for each token
    /// @param slugList List of icon slugs (must exist in registry, PNG or SVG)
    function mapTokensBatch(
        address[] calldata tokens,
        uint256[] calldata chainIds,
        string[] calldata slugList
    ) external onlyOwner {
        uint256 len = tokens.length;
        if (chainIds.length != len) {
            revert LengthMismatch(len, chainIds.length);
        }
        if (slugList.length != len) {
            revert LengthMismatch(len, slugList.length);
        }

        for (uint256 i = 0; i < len;) {
            bytes32 slugHash = _hashSlug(slugList[i]);
            if (!_hasAnyIcon(slugHash)) revert NoIconAvailable(slugHash);
            tokenToIcon[tokens[i]][chainIds[i]] = slugHash;
            emit TokenMapped(tokens[i], chainIds[i], slugHash);

            unchecked { ++i; }
        }
    }

    /// @notice Map chain ID to chain icon
    /// @dev Overwrites any existing mapping for this chainId.
    ///      V2: Accepts slugs with either PNG or SVG icons.
    /// @param chainId EVM chain ID (e.g., 1 for Ethereum, 137 for Polygon)
    /// @param slug Icon slug that must already exist in the registry (PNG or SVG)
    function mapChain(uint256 chainId, string calldata slug) external onlyOwner {
        bytes32 slugHash = _hashSlug(slug);
        if (!_hasAnyIcon(slugHash)) revert NoIconAvailable(slugHash);
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
        if (icon.pointer == address(0)) revert VersionNotFound(slugHash, version);
        return SSTORE2.read(icon.pointer);
    }

    /// @notice Get current version number for a slug
    /// @param slugHash keccak256(bytes(slug))
    /// @return Current version number (1 or higher)
    function getCurrentVersion(bytes32 slugHash) external view returns (uint32) {
        Icon storage icon = icons[slugHash];
        if (icon.pointer == address(0)) revert IconNotFound(slugHash);
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
        if (icon.pointer == address(0)) revert IconNotFound(slugHash);
        return (icon.pointer, icon.width, icon.height, icon.version);
    }

    // ========== GETTERS: By Token ==========

    /// @notice Get icon by token address and chainId
    /// @dev Reverts with TokenIconNotMapped if no slug is mapped for (token, chainId).
    ///      Reverts with IconNotFound if a slug is mapped but the icon record is missing.
    /// @param token Token contract address
    /// @param chainId Chain ID where token is deployed
    /// @return Raw PNG icon bytes
    function getIconByToken(address token, uint256 chainId) external view returns (bytes memory) {
        bytes32 slugHash = tokenToIcon[token][chainId];
        if (slugHash == bytes32(0)) revert TokenIconNotMapped(token, chainId);
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
    /// @dev Reverts with ChainIconNotMapped if no icon is mapped for chainId.
    ///      Reverts with IconNotFound if a slug is mapped but the icon record is missing.
    /// @param chainId EVM chain ID (e.g., 1 for Ethereum)
    /// @return Raw PNG icon bytes
    function getChainIcon(uint256 chainId) external view returns (bytes memory) {
        bytes32 slugHash = chainToIcon[chainId];
        if (slugHash == bytes32(0)) revert ChainIconNotMapped(chainId);
        return _getIconData(slugHash);
    }

    // ========== GETTERS: Data URI ==========

    /// @notice Get icon as data URI (for direct use in img src)
    /// @dev Returns base64-encoded PNG data URI. Gas-heavy; intended for off-chain use.
    /// @param slugHash keccak256(bytes(slug))
    /// @return Data URI string (e.g., "data:image/png;base64,...")
    function getIconDataURI(bytes32 slugHash) external view returns (string memory) {
        Icon storage icon = icons[slugHash];
        if (icon.pointer == address(0)) revert IconNotFound(slugHash);

        bytes memory data = SSTORE2.read(icon.pointer);
        return string(abi.encodePacked("data:image/png;base64,", _base64(data)));
    }

    /// @notice Get token icon as data URI
    /// @dev Returns base64-encoded PNG data URI. Gas-heavy; intended for off-chain use.
    ///      Reverts with TokenIconNotMapped if no slug is mapped for (token, chainId).
    /// @param token Token contract address
    /// @param chainId Chain ID where token is deployed
    /// @return Data URI string
    function getTokenIconDataURI(address token, uint256 chainId)
        external
        view
        returns (string memory)
    {
        bytes32 slugHash = tokenToIcon[token][chainId];
        if (slugHash == bytes32(0)) revert TokenIconNotMapped(token, chainId);

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
        if (chainIds.length != len) revert LengthMismatch(len, chainIds.length);

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

    // ========== GETTERS: SVG (V2) ==========

    /// @notice Get SVG icon by slug string (latest version)
    /// @param slug Human-readable slug (e.g., "tokens/aave")
    /// @return Raw SVG icon bytes
    function getSvgIconBySlug(string calldata slug) external view returns (bytes memory) {
        bytes32 slugHash = _hashSlug(slug);
        return _getSvgIconData(slugHash);
    }

    /// @notice Get SVG icon by pre-computed slug hash (latest version)
    /// @param slugHash keccak256(bytes(slug))
    /// @return Raw SVG icon bytes
    function getSvgIcon(bytes32 slugHash) external view returns (bytes memory) {
        return _getSvgIconData(slugHash);
    }

    /// @notice Get specific version of an SVG icon
    /// @param slugHash keccak256(bytes(slug))
    /// @param version Version number (1-indexed)
    /// @return Raw SVG icon bytes for that version
    function getSvgIconVersion(bytes32 slugHash, uint32 version) external view returns (bytes memory) {
        Icon storage icon = svgIconVersions[slugHash][version];
        if (icon.pointer == address(0)) revert VersionNotFound(slugHash, version);
        return SSTORE2.read(icon.pointer);
    }

    /// @notice Get SVG icon as data URI (for direct use in img src)
    /// @dev Returns base64-encoded SVG data URI. Gas-heavy; intended for off-chain use.
    /// @param slugHash keccak256(bytes(slug))
    /// @return Data URI string (e.g., "data:image/svg+xml;base64,...")
    function getSvgIconDataURI(bytes32 slugHash) external view returns (string memory) {
        Icon storage icon = svgIcons[slugHash];
        if (icon.pointer == address(0)) revert IconNotFound(slugHash);

        bytes memory data = SSTORE2.read(icon.pointer);
        return string(abi.encodePacked("data:image/svg+xml;base64,", _base64(data)));
    }

    /// @notice Get SVG icon by token address and chainId
    /// @param token Token contract address
    /// @param chainId Chain ID where token is deployed
    /// @return Raw SVG icon bytes
    function getSvgIconByToken(address token, uint256 chainId) external view returns (bytes memory) {
        bytes32 slugHash = tokenToIcon[token][chainId];
        if (slugHash == bytes32(0)) revert TokenIconNotMapped(token, chainId);
        return _getSvgIconData(slugHash);
    }

    /// @notice Get SVG chain icon by chainId
    /// @param chainId EVM chain ID (e.g., 1 for Ethereum)
    /// @return Raw SVG icon bytes
    function getSvgChainIcon(uint256 chainId) external view returns (bytes memory) {
        bytes32 slugHash = chainToIcon[chainId];
        if (slugHash == bytes32(0)) revert ChainIconNotMapped(chainId);
        return _getSvgIconData(slugHash);
    }

    /// @notice Batch get SVG icons by slug hashes
    /// @param slugHashes Array of keccak256(bytes(slug)) values
    /// @return result Array of SVG icon bytes (empty for missing icons)
    function batchGetSvgIcons(bytes32[] calldata slugHashes)
        external
        view
        returns (bytes[] memory result)
    {
        result = new bytes[](slugHashes.length);
        for (uint256 i = 0; i < slugHashes.length;) {
            Icon storage icon = svgIcons[slugHashes[i]];
            if (icon.pointer != address(0)) {
                result[i] = SSTORE2.read(icon.pointer);
            }
            unchecked { ++i; }
        }
    }

    // ========== GETTERS: Best Icon (V2) ==========

    /// @notice Get the best available icon for a slug (SVG preferred, PNG fallback)
    /// @param slugHash keccak256(bytes(slug))
    /// @return data Raw icon bytes
    /// @return format IconFormat indicating the format (PNG or SVG)
    function getBestIcon(bytes32 slugHash) external view returns (bytes memory data, IconFormat format) {
        Icon storage svg = svgIcons[slugHash];
        if (svg.pointer != address(0)) {
            return (SSTORE2.read(svg.pointer), IconFormat.SVG);
        }
        Icon storage png = icons[slugHash];
        if (png.pointer != address(0)) {
            return (SSTORE2.read(png.pointer), IconFormat.PNG);
        }
        revert NoIconAvailable(slugHash);
    }

    /// @notice Get the best available icon as data URI (SVG preferred, PNG fallback)
    /// @param slugHash keccak256(bytes(slug))
    /// @return Data URI string with correct MIME type
    function getBestIconDataURI(bytes32 slugHash) external view returns (string memory) {
        Icon storage svg = svgIcons[slugHash];
        if (svg.pointer != address(0)) {
            bytes memory data = SSTORE2.read(svg.pointer);
            return string(abi.encodePacked("data:image/svg+xml;base64,", _base64(data)));
        }
        Icon storage png = icons[slugHash];
        if (png.pointer != address(0)) {
            bytes memory data = SSTORE2.read(png.pointer);
            return string(abi.encodePacked("data:image/png;base64,", _base64(data)));
        }
        revert NoIconAvailable(slugHash);
    }

    /// @notice Get the best available icon for a token (SVG preferred, PNG fallback)
    /// @param token Token contract address
    /// @param chainId Chain ID where token is deployed
    /// @return data Raw icon bytes
    /// @return format IconFormat indicating the format (PNG or SVG)
    function getBestIconByToken(address token, uint256 chainId)
        external
        view
        returns (bytes memory data, IconFormat format)
    {
        bytes32 slugHash = tokenToIcon[token][chainId];
        if (slugHash == bytes32(0)) revert TokenIconNotMapped(token, chainId);

        Icon storage svg = svgIcons[slugHash];
        if (svg.pointer != address(0)) {
            return (SSTORE2.read(svg.pointer), IconFormat.SVG);
        }
        Icon storage png = icons[slugHash];
        if (png.pointer != address(0)) {
            return (SSTORE2.read(png.pointer), IconFormat.PNG);
        }
        revert NoIconAvailable(slugHash);
    }

    /// @notice Get the best available chain icon (SVG preferred, PNG fallback)
    /// @param chainId EVM chain ID
    /// @return data Raw icon bytes
    /// @return format IconFormat indicating the format (PNG or SVG)
    function getBestChainIcon(uint256 chainId)
        external
        view
        returns (bytes memory data, IconFormat format)
    {
        bytes32 slugHash = chainToIcon[chainId];
        if (slugHash == bytes32(0)) revert ChainIconNotMapped(chainId);

        Icon storage svg = svgIcons[slugHash];
        if (svg.pointer != address(0)) {
            return (SSTORE2.read(svg.pointer), IconFormat.SVG);
        }
        Icon storage png = icons[slugHash];
        if (png.pointer != address(0)) {
            return (SSTORE2.read(png.pointer), IconFormat.PNG);
        }
        revert NoIconAvailable(slugHash);
    }

    /// @notice Check what icon formats are available for a slug
    /// @param slugHash keccak256(bytes(slug))
    /// @return hasPng True if PNG icon exists
    /// @return hasSvg True if SVG icon exists
    function getAvailableFormats(bytes32 slugHash) external view returns (bool hasPng, bool hasSvg) {
        hasPng = icons[slugHash].pointer != address(0);
        hasSvg = svgIcons[slugHash].pointer != address(0);
    }

    // ========== ENUMERATION ==========

    /// @notice Get total number of unique slugs (icons) registered
    /// @return Number of icons that have been added (PNG or SVG)
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
        if (icon.pointer == address(0)) revert IconNotFound(slugHash);
        return SSTORE2.read(icon.pointer);
    }

    /// @dev Validates that icon data is a valid SVG.
    ///      Checks for <svg tag presence and enforces max size.
    ///      Note: This is minimal validation. Off-chain sanitization (SVGO) is required.
    /// @param data Raw SVG bytes to validate
    function _validateSVG(bytes calldata data) internal pure {
        if (data.length > MAX_SVG_SIZE) revert InvalidSVG();
        if (!_containsSvgTag(data)) revert InvalidSVG();
    }

    /// @dev Checks if data contains <svg tag (case-insensitive for first 1KB)
    /// @param data Raw bytes to check
    /// @return True if <svg tag is found
    function _containsSvgTag(bytes calldata data) internal pure returns (bool) {
        uint256 searchLen = data.length < 1024 ? data.length : 1024;
        if (searchLen < 4) return false;

        for (uint256 i = 0; i < searchLen - 3;) {
            if (
                (data[i] == 0x3C) && // '<'
                (data[i + 1] == 0x73 || data[i + 1] == 0x53) && // 's' or 'S'
                (data[i + 2] == 0x76 || data[i + 2] == 0x56) && // 'v' or 'V'
                (data[i + 3] == 0x67 || data[i + 3] == 0x47) // 'g' or 'G'
            ) {
                return true;
            }
            unchecked { ++i; }
        }
        return false;
    }

    /// @dev Retrieves SVG icon data from SSTORE2. Reverts if icon doesn't exist.
    /// @param slugHash keccak256(bytes(slug))
    /// @return Raw SVG icon bytes
    function _getSvgIconData(bytes32 slugHash) internal view returns (bytes memory) {
        Icon storage icon = svgIcons[slugHash];
        if (icon.pointer == address(0)) revert IconNotFound(slugHash);
        return SSTORE2.read(icon.pointer);
    }

    /// @dev Checks if any icon (PNG or SVG) exists for a slug
    /// @param slugHash keccak256(bytes(slug))
    /// @return True if PNG or SVG icon exists
    function _hasAnyIcon(bytes32 slugHash) internal view returns (bool) {
        return icons[slugHash].pointer != address(0) || svgIcons[slugHash].pointer != address(0);
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

    /// @dev Reserved storage gap for future upgrades (reduced from 50 to 48 for V2 SVG support)
    uint256[48] private __gap;
}
