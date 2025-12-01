// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title IIconRegistry
/// @notice Interface for on-chain icon registry
interface IIconRegistry {
    // ========== By Slug ==========
    
    /// @notice Get icon by slug (e.g., "protocols/uniswap")
    function getIconBySlug(string calldata slug) external view returns (bytes memory);
    
    /// @notice Get icon by pre-computed keccak256(slug)
    function getIcon(bytes32 slugHash) external view returns (bytes memory);

    // ========== By Token ==========
    
    /// @notice Get icon by token contract address
    /// @param token Token contract address
    /// @param chainId Chain ID where token is deployed
    function getIconByToken(address token, uint256 chainId) external view returns (bytes memory);
    
    /// @notice Check if token has an icon
    function hasTokenIcon(address token, uint256 chainId) external view returns (bool);

    // ========== By Chain ==========
    
    /// @notice Get chain icon by chain ID (e.g., 1 for Ethereum)
    function getChainIcon(uint256 chainId) external view returns (bytes memory);

    // ========== Data URI ==========
    
    /// @notice Get icon as base64 data URI for direct use in <img src="">
    function getIconDataURI(bytes32 slugHash) external view returns (string memory);
    
    /// @notice Get token icon as data URI
    function getTokenIconDataURI(address token, uint256 chainId) external view returns (string memory);

    // ========== Batch ==========
    
    /// @notice Get multiple icons by slug hashes
    function batchGetIcons(bytes32[] calldata slugHashes) external view returns (bytes[] memory);
    
    /// @notice Get multiple icons by token addresses
    function batchGetTokenIcons(
        address[] calldata tokens, 
        uint256[] calldata chainIds
    ) external view returns (bytes[] memory);

    // ========== Enumeration ==========
    
    function totalIcons() external view returns (uint256);
}
