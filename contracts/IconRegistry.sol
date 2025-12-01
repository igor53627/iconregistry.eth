// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {SSTORE2} from "solady/utils/SSTORE2.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

/// @title IconRegistry
/// @notice Upgradeable registry for on-chain icons with token address and slug lookups
contract IconRegistry is OwnableUpgradeable, UUPSUpgradeable {
    
    /// @notice Icon data stored via SSTORE2
    struct Icon {
        address pointer;     // SSTORE2 pointer
        uint32 width;
        uint32 height;
        IconFormat format;
    }

    enum IconFormat { PNG, SVG, WEBP }

    /// @notice slug hash => Icon
    mapping(bytes32 => Icon) public icons;

    /// @notice token address => chainId => slug hash
    mapping(address => mapping(uint256 => bytes32)) public tokenToIcon;

    /// @notice chainId => slug hash (for chain icons)
    mapping(uint256 => bytes32) public chainToIcon;

    /// @notice All registered slugs for enumeration
    bytes32[] public slugs;
    mapping(bytes32 => uint256) public slugIndex; // 1-indexed

    event IconAdded(bytes32 indexed slugHash, string slug, address pointer);
    event TokenMapped(address indexed token, uint256 indexed chainId, bytes32 slugHash);
    event ChainMapped(uint256 indexed chainId, bytes32 slugHash);

    error IconNotFound();
    error IconAlreadyExists();
    error InvalidData();

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address owner_) external initializer {
        __Ownable_init(owner_);
        __UUPSUpgradeable_init();
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}

    // ========== ADMIN: Add Icons ==========

    /// @notice Add icon by slug (e.g., "protocols/uniswap")
    function addIcon(
        string calldata slug,
        bytes calldata data,
        uint32 width,
        uint32 height,
        IconFormat format
    ) external onlyOwner {
        bytes32 slugHash = keccak256(bytes(slug));
        if (icons[slugHash].pointer != address(0)) revert IconAlreadyExists();
        if (data.length == 0) revert InvalidData();

        address pointer = SSTORE2.write(data);
        icons[slugHash] = Icon(pointer, width, height, format);
        
        slugs.push(slugHash);
        slugIndex[slugHash] = slugs.length;

        emit IconAdded(slugHash, slug, pointer);
    }

    /// @notice Batch add icons
    function addIconsBatch(
        string[] calldata slugList,
        bytes[] calldata dataList,
        uint32[] calldata widths,
        uint32[] calldata heights,
        IconFormat[] calldata formats
    ) external onlyOwner {
        uint256 len = slugList.length;
        for (uint256 i = 0; i < len; i++) {
            bytes32 slugHash = keccak256(bytes(slugList[i]));
            if (icons[slugHash].pointer != address(0)) revert IconAlreadyExists();
            if (dataList[i].length == 0) revert InvalidData();

            address pointer = SSTORE2.write(dataList[i]);
            icons[slugHash] = Icon(pointer, widths[i], heights[i], formats[i]);
            
            slugs.push(slugHash);
            slugIndex[slugHash] = slugs.length;

            emit IconAdded(slugHash, slugList[i], pointer);
        }
    }

    // ========== ADMIN: Map Tokens/Chains ==========

    /// @notice Map token address to icon slug
    function mapToken(address token, uint256 chainId, string calldata slug) external onlyOwner {
        bytes32 slugHash = keccak256(bytes(slug));
        if (icons[slugHash].pointer == address(0)) revert IconNotFound();
        tokenToIcon[token][chainId] = slugHash;
        emit TokenMapped(token, chainId, slugHash);
    }

    /// @notice Batch map tokens
    function mapTokensBatch(
        address[] calldata tokens,
        uint256[] calldata chainIds,
        string[] calldata slugList
    ) external onlyOwner {
        uint256 len = tokens.length;
        for (uint256 i = 0; i < len; i++) {
            bytes32 slugHash = keccak256(bytes(slugList[i]));
            if (icons[slugHash].pointer == address(0)) revert IconNotFound();
            tokenToIcon[tokens[i]][chainIds[i]] = slugHash;
            emit TokenMapped(tokens[i], chainIds[i], slugHash);
        }
    }

    /// @notice Map chainId to chain icon
    function mapChain(uint256 chainId, string calldata slug) external onlyOwner {
        bytes32 slugHash = keccak256(bytes(slug));
        if (icons[slugHash].pointer == address(0)) revert IconNotFound();
        chainToIcon[chainId] = slugHash;
        emit ChainMapped(chainId, slugHash);
    }

    // ========== GETTERS: By Slug ==========

    /// @notice Get icon by slug string
    function getIconBySlug(string calldata slug) external view returns (bytes memory) {
        bytes32 slugHash = keccak256(bytes(slug));
        return _getIconData(slugHash);
    }

    /// @notice Get icon by pre-computed slug hash
    function getIcon(bytes32 slugHash) external view returns (bytes memory) {
        return _getIconData(slugHash);
    }

    // ========== GETTERS: By Token ==========

    /// @notice Get icon by token address and chainId
    function getIconByToken(address token, uint256 chainId) external view returns (bytes memory) {
        bytes32 slugHash = tokenToIcon[token][chainId];
        if (slugHash == bytes32(0)) revert IconNotFound();
        return _getIconData(slugHash);
    }

    /// @notice Check if token has icon mapped
    function hasTokenIcon(address token, uint256 chainId) external view returns (bool) {
        return tokenToIcon[token][chainId] != bytes32(0);
    }

    // ========== GETTERS: By Chain ==========

    /// @notice Get chain icon by chainId
    function getChainIcon(uint256 chainId) external view returns (bytes memory) {
        bytes32 slugHash = chainToIcon[chainId];
        if (slugHash == bytes32(0)) revert IconNotFound();
        return _getIconData(slugHash);
    }

    // ========== GETTERS: Data URI ==========

    /// @notice Get icon as data URI (for direct use in img src)
    function getIconDataURI(bytes32 slugHash) external view returns (string memory) {
        Icon storage icon = icons[slugHash];
        if (icon.pointer == address(0)) revert IconNotFound();
        
        bytes memory data = SSTORE2.read(icon.pointer);
        string memory mime = _getMime(icon.format);
        
        return string(abi.encodePacked("data:", mime, ";base64,", _base64(data)));
    }

    /// @notice Get token icon as data URI
    function getTokenIconDataURI(address token, uint256 chainId) external view returns (string memory) {
        bytes32 slugHash = tokenToIcon[token][chainId];
        if (slugHash == bytes32(0)) revert IconNotFound();
        
        Icon storage icon = icons[slugHash];
        bytes memory data = SSTORE2.read(icon.pointer);
        string memory mime = _getMime(icon.format);
        
        return string(abi.encodePacked("data:", mime, ";base64,", _base64(data)));
    }

    // ========== GETTERS: Batch ==========

    /// @notice Batch get icons by slug hashes
    function batchGetIcons(bytes32[] calldata slugHashes) external view returns (bytes[] memory result) {
        result = new bytes[](slugHashes.length);
        for (uint256 i = 0; i < slugHashes.length; i++) {
            Icon storage icon = icons[slugHashes[i]];
            if (icon.pointer != address(0)) {
                result[i] = SSTORE2.read(icon.pointer);
            }
        }
    }

    /// @notice Batch get icons by tokens
    function batchGetTokenIcons(
        address[] calldata tokens,
        uint256[] calldata chainIds
    ) external view returns (bytes[] memory result) {
        result = new bytes[](tokens.length);
        for (uint256 i = 0; i < tokens.length; i++) {
            bytes32 slugHash = tokenToIcon[tokens[i]][chainIds[i]];
            if (slugHash != bytes32(0)) {
                Icon storage icon = icons[slugHash];
                if (icon.pointer != address(0)) {
                    result[i] = SSTORE2.read(icon.pointer);
                }
            }
        }
    }

    // ========== ENUMERATION ==========

    function totalIcons() external view returns (uint256) {
        return slugs.length;
    }

    function getSlugsPaginated(uint256 offset, uint256 limit) 
        external view returns (bytes32[] memory result) 
    {
        uint256 total = slugs.length;
        if (offset >= total) return new bytes32[](0);
        
        uint256 end = offset + limit > total ? total : offset + limit;
        result = new bytes32[](end - offset);
        for (uint256 i = offset; i < end; i++) {
            result[i - offset] = slugs[i];
        }
    }

    // ========== INTERNAL ==========

    function _getIconData(bytes32 slugHash) internal view returns (bytes memory) {
        Icon storage icon = icons[slugHash];
        if (icon.pointer == address(0)) revert IconNotFound();
        return SSTORE2.read(icon.pointer);
    }

    function _getMime(IconFormat f) internal pure returns (string memory) {
        if (f == IconFormat.PNG) return "image/png";
        if (f == IconFormat.SVG) return "image/svg+xml";
        return "image/webp";
    }

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

        if (len % 3 == 1) { result[encodedLen - 1] = "="; result[encodedLen - 2] = "="; }
        else if (len % 3 == 2) { result[encodedLen - 1] = "="; }

        return string(result);
    }
}
