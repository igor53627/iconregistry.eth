// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import {Test} from "forge-std/Test.sol";
import {IconRegistry} from "../contracts/IconRegistry.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

contract IconRegistryTest is Test {
    IconRegistry public registry;
    IconRegistry public impl;

    address public owner = address(0x1);
    address public user = address(0x2);

    // Valid PNG: 8-byte signature + minimal IHDR chunk
    // PNG signature: 0x89 0x50 0x4E 0x47 0x0D 0x0A 0x1A 0x0A
    bytes public constant VALID_PNG =
        hex"89504E470D0A1A0A0000000D49484452000000010000000108000000003A7E9B55";

    // Second valid PNG for versioning tests (different IHDR data)
    bytes public constant VALID_PNG_V2 =
        hex"89504E470D0A1A0A0000000D4948445200000040000000400800000000B5E81F89";

    // Invalid data (random bytes, not PNG)
    bytes public constant INVALID_DATA = hex"DEADBEEFCAFEBABE12345678AABBCCDD";

    // Too short (less than 8 bytes)
    bytes public constant SHORT_DATA = hex"89504E47";

    function setUp() public {
        // Deploy implementation
        impl = new IconRegistry();

        // Deploy proxy
        bytes memory initData = abi.encodeWithSelector(IconRegistry.initialize.selector, owner);
        ERC1967Proxy proxy = new ERC1967Proxy(address(impl), initData);

        registry = IconRegistry(payable(address(proxy)));
    }

    // ========== PNG VALIDATION TESTS ==========

    function test_setIcon_validPNG() public {
        vm.prank(owner);
        registry.setIcon("test/icon", VALID_PNG, 64, 64);

        bytes memory retrieved = registry.getIconBySlug("test/icon");
        assertEq(retrieved, VALID_PNG);
    }

    function test_setIcon_revert_invalidPNG() public {
        vm.prank(owner);
        vm.expectRevert(IconRegistry.InvalidPNG.selector);
        registry.setIcon("test/fake", INVALID_DATA, 64, 64);
    }

    function test_setIcon_revert_tooShort() public {
        vm.prank(owner);
        vm.expectRevert(IconRegistry.InvalidPNG.selector);
        registry.setIcon("test/short", SHORT_DATA, 64, 64);
    }

    function test_setIcon_revert_emptyData() public {
        vm.prank(owner);
        vm.expectRevert(IconRegistry.InvalidData.selector);
        registry.setIcon("test/empty", "", 64, 64);
    }

    // ========== BATCH VALIDATION TESTS ==========

    function test_setIconsBatch_validPNGs() public {
        string[] memory slugList = new string[](2);
        slugList[0] = "batch/icon1";
        slugList[1] = "batch/icon2";

        bytes[] memory dataList = new bytes[](2);
        dataList[0] = VALID_PNG;
        dataList[1] = VALID_PNG_V2;

        uint32[] memory widths = new uint32[](2);
        widths[0] = 64;
        widths[1] = 64;

        uint32[] memory heights = new uint32[](2);
        heights[0] = 64;
        heights[1] = 64;

        vm.prank(owner);
        registry.setIconsBatch(slugList, dataList, widths, heights);

        assertEq(registry.getIconBySlug("batch/icon1"), VALID_PNG);
        assertEq(registry.getIconBySlug("batch/icon2"), VALID_PNG_V2);
    }

    function test_setIconsBatch_revert_invalidPNG() public {
        string[] memory slugList = new string[](2);
        slugList[0] = "batch/valid";
        slugList[1] = "batch/invalid";

        bytes[] memory dataList = new bytes[](2);
        dataList[0] = VALID_PNG;
        dataList[1] = INVALID_DATA;

        uint32[] memory widths = new uint32[](2);
        widths[0] = 64;
        widths[1] = 64;

        uint32[] memory heights = new uint32[](2);
        heights[0] = 64;
        heights[1] = 64;

        vm.prank(owner);
        vm.expectRevert(IconRegistry.InvalidPNG.selector);
        registry.setIconsBatch(slugList, dataList, widths, heights);
    }

    function test_setIconsBatch_revert_lengthMismatch() public {
        string[] memory slugList = new string[](2);
        bytes[] memory dataList = new bytes[](1); // Mismatch!
        uint32[] memory widths = new uint32[](2);
        uint32[] memory heights = new uint32[](2);

        vm.prank(owner);
        vm.expectRevert(IconRegistry.LengthMismatch.selector);
        registry.setIconsBatch(slugList, dataList, widths, heights);
    }

    // ========== VERSIONING TESTS ==========

    function test_setIcon_versioning() public {
        vm.startPrank(owner);

        // Version 1
        registry.setIcon("test/versioned", VALID_PNG, 64, 64);
        assertEq(registry.getCurrentVersion(keccak256("test/versioned")), 1);

        // Version 2
        registry.setIcon("test/versioned", VALID_PNG_V2, 64, 64);
        assertEq(registry.getCurrentVersion(keccak256("test/versioned")), 2);

        // Verify both versions accessible
        bytes32 slugHash = keccak256("test/versioned");
        assertEq(registry.getIconVersion(slugHash, 1), VALID_PNG);
        assertEq(registry.getIconVersion(slugHash, 2), VALID_PNG_V2);

        // Latest returns v2
        assertEq(registry.getIcon(slugHash), VALID_PNG_V2);

        vm.stopPrank();
    }

    function test_getIconVersion_revert_notFound() public {
        vm.expectRevert(IconRegistry.VersionNotFound.selector);
        registry.getIconVersion(keccak256("missing"), 1);
    }

    // ========== ACCESS CONTROL TESTS ==========

    function test_setIcon_revert_notOwner() public {
        vm.prank(user);
        vm.expectRevert();
        registry.setIcon("test/icon", VALID_PNG, 64, 64);
    }

    function test_mapToken_revert_notOwner() public {
        vm.prank(owner);
        registry.setIcon("test/icon", VALID_PNG, 64, 64);

        vm.prank(user);
        vm.expectRevert();
        registry.mapToken(address(0x123), 1, "test/icon");
    }

    function test_mapChain_revert_notOwner() public {
        vm.prank(owner);
        registry.setIcon("chains/eth", VALID_PNG, 64, 64);

        vm.prank(user);
        vm.expectRevert();
        registry.mapChain(1, "chains/eth");
    }

    // ========== MAPPING TESTS ==========

    function test_mapToken() public {
        vm.startPrank(owner);

        registry.setIcon("tokens/usdc", VALID_PNG, 64, 64);
        registry.mapToken(address(0x123), 1, "tokens/usdc");

        bytes memory icon = registry.getIconByToken(address(0x123), 1);
        assertEq(icon, VALID_PNG);
        assertTrue(registry.hasTokenIcon(address(0x123), 1));

        vm.stopPrank();
    }

    function test_hasTokenIcon() public {
        assertFalse(registry.hasTokenIcon(address(0x123), 1));

        vm.startPrank(owner);
        registry.setIcon("tokens/usdc", VALID_PNG, 64, 64);
        registry.mapToken(address(0x123), 1, "tokens/usdc");
        vm.stopPrank();

        assertTrue(registry.hasTokenIcon(address(0x123), 1));
        assertFalse(registry.hasTokenIcon(address(0x123), 137)); // Different chain
    }

    function test_mapChain() public {
        vm.startPrank(owner);

        registry.setIcon("chains/ethereum", VALID_PNG, 64, 64);
        registry.mapChain(1, "chains/ethereum");

        bytes memory icon = registry.getChainIcon(1);
        assertEq(icon, VALID_PNG);

        vm.stopPrank();
    }

    function test_mapToken_revert_iconNotFound() public {
        vm.prank(owner);
        vm.expectRevert(IconRegistry.IconNotFound.selector);
        registry.mapToken(address(0x123), 1, "nonexistent/icon");
    }

    function test_mapChain_revert_iconNotFound() public {
        vm.prank(owner);
        vm.expectRevert(IconRegistry.IconNotFound.selector);
        registry.mapChain(1, "nonexistent/icon");
    }

    function test_mapTokensBatch() public {
        vm.startPrank(owner);
        registry.setIcon("tokens/usdc", VALID_PNG, 64, 64);
        registry.setIcon("tokens/dai", VALID_PNG_V2, 64, 64);

        address[] memory tokens = new address[](2);
        tokens[0] = address(0x111);
        tokens[1] = address(0x222);

        uint256[] memory chainIds = new uint256[](2);
        chainIds[0] = 1;
        chainIds[1] = 1;

        string[] memory slugList = new string[](2);
        slugList[0] = "tokens/usdc";
        slugList[1] = "tokens/dai";

        registry.mapTokensBatch(tokens, chainIds, slugList);

        assertEq(registry.getIconByToken(address(0x111), 1), VALID_PNG);
        assertEq(registry.getIconByToken(address(0x222), 1), VALID_PNG_V2);
        vm.stopPrank();
    }

    // ========== GETTER TESTS ==========

    function test_getIconBySlug_revert_notFound() public {
        vm.expectRevert(IconRegistry.IconNotFound.selector);
        registry.getIconBySlug("missing/icon");
    }

    function test_getIcon_revert_notFound() public {
        vm.expectRevert(IconRegistry.IconNotFound.selector);
        registry.getIcon(keccak256("missing/icon"));
    }

    function test_getIconByToken_revert_notFound() public {
        vm.expectRevert(IconRegistry.IconNotFound.selector);
        registry.getIconByToken(address(0x999), 1);
    }

    function test_getChainIcon_revert_notFound() public {
        vm.expectRevert(IconRegistry.IconNotFound.selector);
        registry.getChainIcon(999);
    }

    function test_getCurrentVersion_revert_notFound() public {
        vm.expectRevert(IconRegistry.IconNotFound.selector);
        registry.getCurrentVersion(keccak256("missing"));
    }

    function test_getIconInfo() public {
        vm.prank(owner);
        registry.setIcon("test/info", VALID_PNG, 64, 32);

        bytes32 slugHash = keccak256("test/info");
        (address pointer, uint32 width, uint32 height, uint32 version) = registry.getIconInfo(slugHash);

        assertTrue(pointer != address(0));
        assertEq(width, 64);
        assertEq(height, 32);
        assertEq(version, 1);
    }

    // ========== BATCH GET TESTS ==========

    function test_batchGetIcons() public {
        vm.startPrank(owner);
        registry.setIcon("icon1", VALID_PNG, 64, 64);
        registry.setIcon("icon2", VALID_PNG_V2, 64, 64);
        vm.stopPrank();

        bytes32[] memory slugHashes = new bytes32[](3);
        slugHashes[0] = keccak256("icon1");
        slugHashes[1] = keccak256("icon2");
        slugHashes[2] = keccak256("missing");

        bytes[] memory result = registry.batchGetIcons(slugHashes);

        assertEq(result[0], VALID_PNG);
        assertEq(result[1], VALID_PNG_V2);
        assertEq(result[2].length, 0); // Missing returns empty
    }

    function test_batchGetTokenIcons() public {
        vm.startPrank(owner);
        registry.setIcon("tokens/a", VALID_PNG, 64, 64);
        registry.mapToken(address(0x111), 1, "tokens/a");
        vm.stopPrank();

        address[] memory tokens = new address[](2);
        tokens[0] = address(0x111);
        tokens[1] = address(0x999); // Not mapped

        uint256[] memory chainIds = new uint256[](2);
        chainIds[0] = 1;
        chainIds[1] = 1;

        bytes[] memory result = registry.batchGetTokenIcons(tokens, chainIds);

        assertEq(result[0], VALID_PNG);
        assertEq(result[1].length, 0); // Unmapped returns empty
    }

    function test_batchGetTokenIcons_revert_lengthMismatch() public {
        address[] memory tokens = new address[](2);
        uint256[] memory chainIds = new uint256[](1); // Mismatch!

        vm.expectRevert(IconRegistry.LengthMismatch.selector);
        registry.batchGetTokenIcons(tokens, chainIds);
    }

    // ========== DATA URI TESTS ==========

    function test_getIconDataURI() public {
        vm.prank(owner);
        registry.setIcon("test/uri", VALID_PNG, 64, 64);

        string memory uri = registry.getIconDataURI(keccak256("test/uri"));
        assertTrue(bytes(uri).length > 0);
        // Should start with data:image/png;base64,
        assertEq(_substring(uri, 0, 22), "data:image/png;base64,");
    }

    function test_getTokenIconDataURI() public {
        vm.startPrank(owner);
        registry.setIcon("tokens/test", VALID_PNG, 64, 64);
        registry.mapToken(address(0x123), 1, "tokens/test");
        vm.stopPrank();

        string memory uri = registry.getTokenIconDataURI(address(0x123), 1);
        assertEq(_substring(uri, 0, 22), "data:image/png;base64,");
    }

    function test_getIconDataURI_revert_notFound() public {
        vm.expectRevert(IconRegistry.IconNotFound.selector);
        registry.getIconDataURI(keccak256("missing"));
    }

    // ========== ENUMERATION TESTS ==========

    function test_totalIcons() public {
        assertEq(registry.totalIcons(), 0);

        vm.startPrank(owner);
        registry.setIcon("icon1", VALID_PNG, 64, 64);
        assertEq(registry.totalIcons(), 1);

        registry.setIcon("icon2", VALID_PNG_V2, 64, 64);
        assertEq(registry.totalIcons(), 2);

        // Update existing icon (should not increase count)
        registry.setIcon("icon1", VALID_PNG_V2, 32, 32);
        assertEq(registry.totalIcons(), 2);
        vm.stopPrank();
    }

    function test_getSlugsPaginated() public {
        vm.startPrank(owner);
        registry.setIcon("icon1", VALID_PNG, 64, 64);
        registry.setIcon("icon2", VALID_PNG, 64, 64);
        registry.setIcon("icon3", VALID_PNG, 64, 64);
        vm.stopPrank();

        bytes32[] memory page1 = registry.getSlugsPaginated(0, 2);
        assertEq(page1.length, 2);

        bytes32[] memory page2 = registry.getSlugsPaginated(2, 2);
        assertEq(page2.length, 1);

        bytes32[] memory empty = registry.getSlugsPaginated(10, 2);
        assertEq(empty.length, 0);
    }

    // ========== DONATION TESTS ==========

    function test_receive_ETH() public {
        vm.deal(user, 1 ether);
        vm.prank(user);
        (bool success,) = address(registry).call{value: 1 ether}("");
        assertTrue(success);
        assertEq(address(registry).balance, 1 ether);
    }

    function test_withdrawETH() public {
        vm.deal(address(registry), 1 ether);

        uint256 ownerBalanceBefore = owner.balance;

        vm.prank(owner);
        registry.withdrawETH();

        assertEq(address(registry).balance, 0);
        assertEq(owner.balance, ownerBalanceBefore + 1 ether);
    }

    function test_withdrawETH_revert_notOwner() public {
        vm.deal(address(registry), 1 ether);

        vm.prank(user);
        vm.expectRevert();
        registry.withdrawETH();
    }

    // ========== HELPER FUNCTIONS ==========

    function _substring(string memory str, uint256 startIndex, uint256 length)
        internal
        pure
        returns (string memory)
    {
        bytes memory strBytes = bytes(str);
        bytes memory result = new bytes(length);
        for (uint256 i = 0; i < length; i++) {
            result[i] = strBytes[startIndex + i];
        }
        return string(result);
    }
}
