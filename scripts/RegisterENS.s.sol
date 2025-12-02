// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";

interface IETHRegistrarController {
    function available(string memory name) external view returns (bool);
    function rentPrice(string memory name, uint256 duration) external view returns (uint256);
    function register(
        string calldata name,
        address owner,
        uint256 duration,
        bytes32 secret,
        address resolver,
        bytes[] calldata data,
        bool reverseRecord,
        uint16 ownerControlledFuses
    ) external payable;
    function commit(bytes32 commitment) external;
    function makeCommitment(
        string memory name,
        address owner,
        uint256 duration,
        bytes32 secret,
        address resolver,
        bytes[] calldata data,
        bool reverseRecord,
        uint16 ownerControlledFuses
    ) external pure returns (bytes32);
}

interface IPublicResolver {
    function setAddr(bytes32 node, address addr) external;
}

contract RegisterENS is Script {
    // ENS Mainnet addresses
    address constant ETH_REGISTRAR_CONTROLLER = 0x253553366Da8546fC250F225fe3d25d0C782303b;
    address constant PUBLIC_RESOLVER = 0x231b0Ee14048e9dCcD1d247744d114a4EB5E8E63;
    
    string constant ENS_NAME = "iconregistry";
    uint256 constant REGISTRATION_DURATION = 365 days;
    
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        
        console.log("=== ENS Registration for iconregistry.eth ===");
        console.log("Deployer/Owner:", deployer);
        console.log("Balance:", deployer.balance);
        
        IETHRegistrarController controller = IETHRegistrarController(ETH_REGISTRAR_CONTROLLER);
        
        // Check availability
        bool available = controller.available(ENS_NAME);
        console.log("Name available:", available);
        require(available, "Name not available");
        
        // Get price
        uint256 price = controller.rentPrice(ENS_NAME, REGISTRATION_DURATION);
        console.log("Registration price (wei):", price);
        console.log("Registration price (ETH):", price / 1e18);
        
        // Generate secret for commit-reveal
        bytes32 secret = keccak256(abi.encodePacked(deployer, block.timestamp, "iconregistry"));
        
        // Prepare resolver data to set address
        bytes[] memory data = new bytes[](1);
        bytes32 node = _namehash("iconregistry.eth");
        data[0] = abi.encodeWithSelector(IPublicResolver.setAddr.selector, node, deployer);
        
        vm.startBroadcast(deployerPrivateKey);
        
        // Step 1: Commit
        bytes32 commitment = controller.makeCommitment(
            ENS_NAME,
            deployer,
            REGISTRATION_DURATION,
            secret,
            PUBLIC_RESOLVER,
            data,
            true,  // Set reverse record
            0      // No fuses
        );
        
        controller.commit(commitment);
        console.log("Commitment hash:", vm.toString(commitment));
        console.log("Secret (save this!):", vm.toString(secret));
        
        vm.stopBroadcast();
        
        console.log("");
        console.log("=== IMPORTANT ===");
        console.log("Wait at least 60 seconds, then run RegisterENSFinalize");
        console.log("Set these environment variables:");
        console.log("  ENS_SECRET=", vm.toString(secret));
    }
    
    function _namehash(string memory name) internal pure returns (bytes32) {
        bytes32 node = bytes32(0);
        if (bytes(name).length == 0) return node;
        
        // Split by dots and hash in reverse
        bytes memory nameBytes = bytes(name);
        uint256 lastDot = nameBytes.length;
        
        for (uint256 i = nameBytes.length; i > 0; i--) {
            if (nameBytes[i-1] == '.') {
                node = keccak256(abi.encodePacked(node, _labelhash(name, i, lastDot)));
                lastDot = i - 1;
            }
        }
        node = keccak256(abi.encodePacked(node, _labelhash(name, 0, lastDot)));
        
        return node;
    }
    
    function _labelhash(string memory name, uint256 start, uint256 end) internal pure returns (bytes32) {
        bytes memory nameBytes = bytes(name);
        bytes memory label = new bytes(end - start);
        for (uint256 i = start; i < end; i++) {
            label[i - start] = nameBytes[i];
        }
        return keccak256(label);
    }
}

contract RegisterENSFinalize is Script {
    address constant ETH_REGISTRAR_CONTROLLER = 0x253553366Da8546fC250F225fe3d25d0C782303b;
    address constant PUBLIC_RESOLVER = 0x231b0Ee14048e9dCcD1d247744d114a4EB5E8E63;
    
    string constant ENS_NAME = "iconregistry";
    uint256 constant REGISTRATION_DURATION = 365 days;
    
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        bytes32 secret = vm.envBytes32("ENS_SECRET");
        
        console.log("=== Finalizing ENS Registration ===");
        console.log("Deployer/Owner:", deployer);
        
        IETHRegistrarController controller = IETHRegistrarController(ETH_REGISTRAR_CONTROLLER);
        
        uint256 price = controller.rentPrice(ENS_NAME, REGISTRATION_DURATION);
        uint256 priceWithBuffer = price * 105 / 100; // 5% buffer for price fluctuations
        
        console.log("Price with 5% buffer:", priceWithBuffer);
        require(deployer.balance >= priceWithBuffer, "Insufficient balance");
        
        // Prepare resolver data
        bytes[] memory data = new bytes[](1);
        bytes32 node = _namehash("iconregistry.eth");
        data[0] = abi.encodeWithSelector(IPublicResolver.setAddr.selector, node, deployer);
        
        vm.startBroadcast(deployerPrivateKey);
        
        controller.register{value: priceWithBuffer}(
            ENS_NAME,
            deployer,
            REGISTRATION_DURATION,
            secret,
            PUBLIC_RESOLVER,
            data,
            true,
            0
        );
        
        vm.stopBroadcast();
        
        console.log("");
        console.log("=== SUCCESS ===");
        console.log("iconregistry.eth registered!");
        console.log("Resolves to:", deployer);
        console.log("View at: https://app.ens.domains/iconregistry.eth");
    }
    
    function _namehash(string memory name) internal pure returns (bytes32) {
        bytes32 node = bytes32(0);
        if (bytes(name).length == 0) return node;
        
        bytes memory nameBytes = bytes(name);
        uint256 lastDot = nameBytes.length;
        
        for (uint256 i = nameBytes.length; i > 0; i--) {
            if (nameBytes[i-1] == '.') {
                node = keccak256(abi.encodePacked(node, _labelhash(name, i, lastDot)));
                lastDot = i - 1;
            }
        }
        node = keccak256(abi.encodePacked(node, _labelhash(name, 0, lastDot)));
        
        return node;
    }
    
    function _labelhash(string memory name, uint256 start, uint256 end) internal pure returns (bytes32) {
        bytes memory nameBytes = bytes(name);
        bytes memory label = new bytes(end - start);
        for (uint256 i = start; i < end; i++) {
            label[i - start] = nameBytes[i];
        }
        return keccak256(label);
    }
}
