// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

/// @title IIconRegistry
/// @author iconregistry.eth
/// @notice Interface for the on-chain icon registry
/// @dev Stable ABI for integrators. All icon data is stored via SSTORE2.
interface IIconRegistry {
    // ========== Errors ==========

    /// @notice Thrown when an icon is requested for a slug that has not been registered
    error IconNotFound();

    /// @notice Thrown when a requested icon version does not exist
    error VersionNotFound();

    // ========== By Slug ==========

    /// @notice Get icon by slug string (e.g., "protocols/uniswap")
    /// @param slug Human-readable identifier for the icon
    /// @return Raw icon bytes (PNG/SVG/WEBP)
    function getIconBySlug(string calldata slug) external view returns (bytes memory);

    /// @notice Get icon by pre-computed keccak256(slug)
    /// @dev More gas efficient when slug hash is already known
    /// @param slugHash keccak256(bytes(slug))
    /// @return Raw icon bytes
    function getIcon(bytes32 slugHash) external view returns (bytes memory);

    // ========== Versioning ==========

    /// @notice Get specific version of an icon
    /// @param slugHash keccak256(bytes(slug))
    /// @param version Version number (1-indexed)
    /// @return Raw icon bytes for that version
    function getIconVersion(bytes32 slugHash, uint32 version) external view returns (bytes memory);

    /// @notice Get current version number for a slug
    /// @param slugHash keccak256(bytes(slug))
    /// @return Current version number (1 or higher)
    function getCurrentVersion(bytes32 slugHash) external view returns (uint32);

    /// @notice Get icon metadata including version
    /// @param slugHash keccak256(bytes(slug))
    /// @return pointer SSTORE2 pointer address
    /// @return width Image width in pixels
    /// @return height Image height in pixels
    /// @return version Current version number
    /// @return format Image format (0=PNG, 1=SVG, 2=WEBP)
    function getIconInfo(bytes32 slugHash)
        external
        view
        returns (address pointer, uint32 width, uint32 height, uint32 version, uint8 format);

    // ========== By Token ==========

    /// @notice Get icon by token contract address
    /// @param token Token contract address
    /// @param chainId Chain ID where token is deployed (e.g., 1 for Ethereum mainnet)
    /// @return Raw icon bytes
    function getIconByToken(address token, uint256 chainId) external view returns (bytes memory);

    /// @notice Check if token has an icon mapped
    /// @param token Token contract address
    /// @param chainId Chain ID where token is deployed
    /// @return True if an icon is mapped for this token+chainId
    function hasTokenIcon(address token, uint256 chainId) external view returns (bool);

    // ========== By Chain ==========

    /// @notice Get chain icon by chain ID (e.g., 1 for Ethereum)
    /// @param chainId EVM chain ID
    /// @return Raw icon bytes
    function getChainIcon(uint256 chainId) external view returns (bytes memory);

    // ========== Data URI ==========

    /// @notice Get icon as base64 data URI for direct use in <img src="">
    /// @dev Gas-heavy; intended for off-chain use
    /// @param slugHash keccak256(bytes(slug))
    /// @return Data URI string (e.g., "data:image/png;base64,...")
    function getIconDataURI(bytes32 slugHash) external view returns (string memory);

    /// @notice Get token icon as data URI
    /// @dev Gas-heavy; intended for off-chain use
    /// @param token Token contract address
    /// @param chainId Chain ID where token is deployed
    /// @return Data URI string
    function getTokenIconDataURI(address token, uint256 chainId)
        external
        view
        returns (string memory);

    // ========== Batch ==========

    /// @notice Get multiple icons by slug hashes
    /// @dev Returns empty bytes for any missing icons (does not revert)
    /// @param slugHashes Array of keccak256(bytes(slug)) values
    /// @return Array of icon bytes (empty for missing icons)
    function batchGetIcons(bytes32[] calldata slugHashes) external view returns (bytes[] memory);

    /// @notice Get multiple icons by token addresses
    /// @dev Returns empty bytes for any unmapped tokens (does not revert)
    /// @param tokens Array of token contract addresses
    /// @param chainIds Array of chain IDs for each token
    /// @return Array of icon bytes (empty for unmapped tokens)
    function batchGetTokenIcons(address[] calldata tokens, uint256[] calldata chainIds)
        external
        view
        returns (bytes[] memory);

    // ========== Enumeration ==========

    /// @notice Get total number of unique icons registered
    /// @return Number of icons
    function totalIcons() external view returns (uint256);
}
