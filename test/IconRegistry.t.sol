// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import {Test, console2} from "forge-std/Test.sol";
import {IconRegistry} from "../contracts/IconRegistry.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

contract IconRegistryTest is Test {
    IconRegistry public registry;
    IconRegistry public impl;

    address public owner = address(0x1);
    address public user = address(0x2);

    // Valid PNG header (minimum valid PNG for testing)
    // PNG magic: 0x89 0x50 0x4E 0x47 0x0D 0x0A 0x1A 0x0A + IHDR chunk
    bytes public constant VALID_PNG =
        hex"89504E470D0A1A0A0000000D49484452000000010000000108000000003A7E9B55";

    // Valid WEBP header: RIFF + size + WEBP + VP8
    bytes public constant VALID_WEBP = hex"52494646240000005745425056503820180000003001009D012A0100010002003425A400";

    // Valid SVG starting with <svg
    bytes public constant VALID_SVG_TAG = '<svg xmlns="http://www.w3.org/2000/svg"></svg>';

    // Valid SVG starting with <?xml
    bytes public constant VALID_SVG_XML =
        '<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"></svg>';

    // Invalid data (random bytes)
    bytes public constant INVALID_DATA = hex"DEADBEEFCAFEBABE12345678AABBCCDD";

    // Malicious SVG with script (valid format but dangerous content)
    bytes public constant MALICIOUS_SVG =
        '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>';

    function setUp() public {
        // Deploy implementation
        impl = new IconRegistry();

        // Deploy proxy
        bytes memory initData = abi.encodeWithSelector(IconRegistry.initialize.selector, owner);
        ERC1967Proxy proxy = new ERC1967Proxy(address(impl), initData);

        registry = IconRegistry(payable(address(proxy)));
    }

    // ========== FORMAT VALIDATION TESTS ==========

    function test_setIcon_validPNG() public {
        vm.prank(owner);
        registry.setIcon("test/icon", VALID_PNG, 64, 64, IconRegistry.IconFormat.PNG);

        bytes memory retrieved = registry.getIconBySlug("test/icon");
        assertEq(retrieved, VALID_PNG);
    }

    function test_setIcon_validWEBP() public {
        vm.prank(owner);
        registry.setIcon("test/webp", VALID_WEBP, 64, 64, IconRegistry.IconFormat.WEBP);

        bytes memory retrieved = registry.getIconBySlug("test/webp");
        assertEq(retrieved, VALID_WEBP);
    }

    function test_setIcon_validSVG_tag() public {
        vm.prank(owner);
        registry.setIcon("test/svg", VALID_SVG_TAG, 64, 64, IconRegistry.IconFormat.SVG);

        bytes memory retrieved = registry.getIconBySlug("test/svg");
        assertEq(retrieved, VALID_SVG_TAG);
    }

    function test_setIcon_validSVG_xml() public {
        vm.prank(owner);
        registry.setIcon("test/svg-xml", VALID_SVG_XML, 64, 64, IconRegistry.IconFormat.SVG);

        bytes memory retrieved = registry.getIconBySlug("test/svg-xml");
        assertEq(retrieved, VALID_SVG_XML);
    }

    function test_setIcon_revert_invalidPNG() public {
        vm.prank(owner);
        vm.expectRevert(IconRegistry.InvalidFormat.selector);
        registry.setIcon("test/fake", INVALID_DATA, 64, 64, IconRegistry.IconFormat.PNG);
    }

    function test_setIcon_revert_invalidWEBP() public {
        vm.prank(owner);
        vm.expectRevert(IconRegistry.InvalidFormat.selector);
        registry.setIcon("test/fake", INVALID_DATA, 64, 64, IconRegistry.IconFormat.WEBP);
    }

    function test_setIcon_revert_invalidSVG() public {
        vm.prank(owner);
        vm.expectRevert(IconRegistry.InvalidFormat.selector);
        registry.setIcon("test/fake", INVALID_DATA, 64, 64, IconRegistry.IconFormat.SVG);
    }

    function test_setIcon_revert_pngDataAsWebp() public {
        vm.prank(owner);
        vm.expectRevert(IconRegistry.InvalidFormat.selector);
        registry.setIcon("test/mismatch", VALID_PNG, 64, 64, IconRegistry.IconFormat.WEBP);
    }

    function test_setIcon_revert_webpDataAsPng() public {
        vm.prank(owner);
        vm.expectRevert(IconRegistry.InvalidFormat.selector);
        registry.setIcon("test/mismatch", VALID_WEBP, 64, 64, IconRegistry.IconFormat.PNG);
    }

    function test_setIcon_revert_svgDataAsPng() public {
        vm.prank(owner);
        vm.expectRevert(IconRegistry.InvalidFormat.selector);
        registry.setIcon("test/mismatch", VALID_SVG_TAG, 64, 64, IconRegistry.IconFormat.PNG);
    }

    function test_setIcon_revert_tooShort() public {
        bytes memory shortData = hex"89504E47"; // Only 4 bytes, need at least 12
        vm.prank(owner);
        vm.expectRevert(IconRegistry.InvalidFormat.selector);
        registry.setIcon("test/short", shortData, 64, 64, IconRegistry.IconFormat.PNG);
    }

    function test_setIcon_revert_emptyData() public {
        vm.prank(owner);
        vm.expectRevert(IconRegistry.InvalidData.selector);
        registry.setIcon("test/empty", "", 64, 64, IconRegistry.IconFormat.PNG);
    }

    // Note: Malicious SVG passes format validation but contains script
    // This is intentional - format validation prevents wrong file types,
    // but SVG content sanitization must happen client-side
    function test_setIcon_maliciousSVG_passesFormatCheck() public {
        vm.prank(owner);
        registry.setIcon("test/evil", MALICIOUS_SVG, 64, 64, IconRegistry.IconFormat.SVG);

        bytes memory retrieved = registry.getIconBySlug("test/evil");
        assertEq(retrieved, MALICIOUS_SVG);
    }

    // ========== BATCH VALIDATION TESTS ==========

    function test_setIconsBatch_validFormats() public {
        string[] memory slugs = new string[](2);
        slugs[0] = "batch/png";
        slugs[1] = "batch/webp";

        bytes[] memory dataList = new bytes[](2);
        dataList[0] = VALID_PNG;
        dataList[1] = VALID_WEBP;

        uint32[] memory widths = new uint32[](2);
        widths[0] = 64;
        widths[1] = 64;

        uint32[] memory heights = new uint32[](2);
        heights[0] = 64;
        heights[1] = 64;

        IconRegistry.IconFormat[] memory formats = new IconRegistry.IconFormat[](2);
        formats[0] = IconRegistry.IconFormat.PNG;
        formats[1] = IconRegistry.IconFormat.WEBP;

        vm.prank(owner);
        registry.setIconsBatch(slugs, dataList, widths, heights, formats);

        assertEq(registry.getIconBySlug("batch/png"), VALID_PNG);
        assertEq(registry.getIconBySlug("batch/webp"), VALID_WEBP);
    }

    function test_setIconsBatch_revert_invalidFormat() public {
        string[] memory slugs = new string[](2);
        slugs[0] = "batch/valid";
        slugs[1] = "batch/invalid";

        bytes[] memory dataList = new bytes[](2);
        dataList[0] = VALID_PNG;
        dataList[1] = INVALID_DATA; // This should fail

        uint32[] memory widths = new uint32[](2);
        widths[0] = 64;
        widths[1] = 64;

        uint32[] memory heights = new uint32[](2);
        heights[0] = 64;
        heights[1] = 64;

        IconRegistry.IconFormat[] memory formats = new IconRegistry.IconFormat[](2);
        formats[0] = IconRegistry.IconFormat.PNG;
        formats[1] = IconRegistry.IconFormat.PNG;

        vm.prank(owner);
        vm.expectRevert(IconRegistry.InvalidFormat.selector);
        registry.setIconsBatch(slugs, dataList, widths, heights, formats);
    }

    // ========== VERSIONING TESTS ==========

    function test_setIcon_versioning() public {
        vm.startPrank(owner);

        // Version 1
        registry.setIcon("test/versioned", VALID_PNG, 64, 64, IconRegistry.IconFormat.PNG);
        assertEq(registry.getCurrentVersion(keccak256("test/versioned")), 1);

        // Version 2 (different data)
        registry.setIcon("test/versioned", VALID_WEBP, 64, 64, IconRegistry.IconFormat.WEBP);
        assertEq(registry.getCurrentVersion(keccak256("test/versioned")), 2);

        // Verify both versions accessible
        bytes32 slugHash = keccak256("test/versioned");
        assertEq(registry.getIconVersion(slugHash, 1), VALID_PNG);
        assertEq(registry.getIconVersion(slugHash, 2), VALID_WEBP);

        vm.stopPrank();
    }

    // ========== ACCESS CONTROL TESTS ==========

    function test_setIcon_revert_notOwner() public {
        vm.prank(user);
        vm.expectRevert();
        registry.setIcon("test/icon", VALID_PNG, 64, 64, IconRegistry.IconFormat.PNG);
    }

    function test_mapToken_revert_notOwner() public {
        vm.prank(owner);
        registry.setIcon("test/icon", VALID_PNG, 64, 64, IconRegistry.IconFormat.PNG);

        vm.prank(user);
        vm.expectRevert();
        registry.mapToken(address(0x123), 1, "test/icon");
    }

    // ========== MAPPING TESTS ==========

    function test_mapToken() public {
        vm.startPrank(owner);

        registry.setIcon("tokens/usdc", VALID_PNG, 64, 64, IconRegistry.IconFormat.PNG);
        registry.mapToken(address(0x123), 1, "tokens/usdc");

        bytes memory icon = registry.getIconByToken(address(0x123), 1);
        assertEq(icon, VALID_PNG);
        assertTrue(registry.hasTokenIcon(address(0x123), 1));

        vm.stopPrank();
    }

    function test_mapChain() public {
        vm.startPrank(owner);

        registry.setIcon("chains/ethereum", VALID_PNG, 64, 64, IconRegistry.IconFormat.PNG);
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

    // ========== BATCH GET TESTS ==========

    function test_batchGetTokenIcons_lengthMismatch() public {
        address[] memory tokens = new address[](2);
        uint256[] memory chainIds = new uint256[](1); // Mismatch!

        vm.expectRevert(IconRegistry.LengthMismatch.selector);
        registry.batchGetTokenIcons(tokens, chainIds);
    }

    // ========== DATA URI TESTS ==========

    function test_getIconDataURI() public {
        vm.prank(owner);
        registry.setIcon("test/uri", VALID_PNG, 64, 64, IconRegistry.IconFormat.PNG);

        string memory uri = registry.getIconDataURI(keccak256("test/uri"));
        assertTrue(bytes(uri).length > 0);
        // Should start with data:image/png;base64,
        assertEq(_substring(uri, 0, 22), "data:image/png;base64,");
    }

    // ========== ENUMERATION TESTS ==========

    function test_totalIcons() public {
        assertEq(registry.totalIcons(), 0);

        vm.startPrank(owner);
        registry.setIcon("icon1", VALID_PNG, 64, 64, IconRegistry.IconFormat.PNG);
        assertEq(registry.totalIcons(), 1);

        registry.setIcon("icon2", VALID_WEBP, 64, 64, IconRegistry.IconFormat.WEBP);
        assertEq(registry.totalIcons(), 2);

        // Update existing icon (should not increase count)
        registry.setIcon("icon1", VALID_PNG, 32, 32, IconRegistry.IconFormat.PNG);
        assertEq(registry.totalIcons(), 2);
        vm.stopPrank();
    }

    function test_getSlugsPaginated() public {
        vm.startPrank(owner);
        registry.setIcon("icon1", VALID_PNG, 64, 64, IconRegistry.IconFormat.PNG);
        registry.setIcon("icon2", VALID_PNG, 64, 64, IconRegistry.IconFormat.PNG);
        registry.setIcon("icon3", VALID_PNG, 64, 64, IconRegistry.IconFormat.PNG);
        vm.stopPrank();

        bytes32[] memory page1 = registry.getSlugsPaginated(0, 2);
        assertEq(page1.length, 2);

        bytes32[] memory page2 = registry.getSlugsPaginated(2, 2);
        assertEq(page2.length, 1);

        bytes32[] memory empty = registry.getSlugsPaginated(10, 2);
        assertEq(empty.length, 0);
    }

    // ========== DONATION TESTS ==========

    function test_withdrawETH() public {
        // Send ETH to registry
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
