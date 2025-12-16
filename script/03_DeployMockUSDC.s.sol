// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "forge-std/Script.sol";
import "../src/MockUSDC.sol";

/**
 * @title 03_DeployMockUSDC
 * @notice Deploy MockUSDC to testnet and mint tokens to deployer
 * @dev Use for testnet only - deploys MockUSDC with 6 decimals
 *      Mints 1 trillion USDC to deployer address
 *
 * Usage:
 *   forge script script/03_DeployMockUSDC.s.sol --rpc-url $BASE_SEPOLIA_RPC_URL --broadcast --verify
 */
contract DeployMockUSDC is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        uint256 chainId = block.chainid;

        console.log("\n=== Deploying MockUSDC to Testnet ===");
        console.log("Chain ID:", chainId);
        console.log("Deployer:", deployer);
        console.log("");

        vm.startBroadcast(deployerPrivateKey);

        // Deploy MockUSDC
        console.log("1. Deploying MockUSDC...");
        MockUSDC usdc = new MockUSDC();
        console.log("   Address:", address(usdc));

        // Mint 1 trillion USDC to deployer (1T = 1e12 tokens * 1e6 decimals = 1e18)
        console.log("\n2. Minting 1 trillion USDC to deployer...");
        uint256 mintAmount = 1_000_000_000_000 * 1e6; // 1T USDC (6 decimals)
        usdc.mint(deployer, mintAmount);
        console.log("   Minted:", mintAmount / 1e6, "USDC");
        console.log("   Balance:", usdc.balanceOf(deployer) / 1e6, "USDC");

        vm.stopBroadcast();

        // Update deployments.json with USDC address
        console.log("\n3. Updating deployments.json with USDC address");
        string memory deploymentsFile = "deployments.json";
        string memory chainKey = string.concat(".", vm.toString(chainId));
        string memory usdcAddress = vm.toString(address(usdc));
        vm.writeJson(usdcAddress, deploymentsFile, string.concat(chainKey, ".usdc"));

        console.log("\n=== Deployment Complete ===");
        console.log("MockUSDC:      ", address(usdc));
        console.log("Deployer:      ", deployer);
        console.log("Balance:       ", usdc.balanceOf(deployer) / 1e6, "USDC");
        console.log("");
    }
}
