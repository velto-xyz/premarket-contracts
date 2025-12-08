// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import "forge-std/Script.sol";
import "../src/PerpFactory.sol";
import "../src/LiquidationEngine.sol";
import "../src/FundingManager.sol";

/**
 * @title 01_DeployCore
 * @notice Deploy core perpetual DEX contracts
 * @dev Network-agnostic deployment - works on any chain
 *      Deploys: LiquidationEngine, FundingManager, PerpFactory
 *      Does NOT deploy USDC (use 02_SetupLocal.s.sol for local/testnet)
 *
 * Usage:
 *   forge script script/01_DeployCore.s.sol --rpc-url $RPC_URL --broadcast --verify
 */
contract DeployCore is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        uint256 chainId = block.chainid;

        vm.startBroadcast(deployerPrivateKey);

        console.log("\n=== Deploying Perp DEX Core ===");
        console.log("Chain ID:", chainId);
        console.log("Deployer:", deployer);
        console.log("");

        // 1. Deploy shared LiquidationEngine
        console.log("1. Deploying LiquidationEngine...");
        LiquidationEngine liquidationEngine = new LiquidationEngine();
        console.log("   Address:", address(liquidationEngine));

        // 2. Deploy shared FundingManager
        console.log("\n2. Deploying FundingManager...");
        FundingManager fundingManager = new FundingManager();
        console.log("   Address:", address(fundingManager));

        // 3. Deploy PerpFactory
        console.log("\n3. Deploying PerpFactory...");
        PerpFactory factory = new PerpFactory(liquidationEngine, fundingManager);
        console.log("   Address:", address(factory));
        console.log("   Owner:", factory.owner());

        vm.stopBroadcast();

        // 4. Write addresses to deployments.json
        console.log("\n4. Writing addresses to deployments.json");

        string memory deploymentsFile = "deployments.json";
        string memory existingJson = "{}";

        // Try to read existing deployments
        try vm.readFile(deploymentsFile) returns (string memory content) {
            existingJson = content;
        } catch {}

        // Build new deployment entry
        string memory deployment = string.concat(
            '{"factory":"', vm.toString(address(factory)),
            '","liquidationEngine":"', vm.toString(address(liquidationEngine)),
            '","fundingManager":"', vm.toString(address(fundingManager)),
            '","deployer":"', vm.toString(deployer),
            '","timestamp":', vm.toString(block.timestamp), '}'
        );

        // Manual JSON merge (simple approach for single chain update)
        string memory chainKey = vm.toString(chainId);
        vm.writeJson(deployment, deploymentsFile, string.concat(".", chainKey));

        // 5. Summary
        console.log("\n=== Deployment Complete ===\n");
        console.log("Network:");
        console.log("--------");
        console.log("Chain ID:", chainId);
        console.log("Deployer:", deployer);
        console.log("");
        console.log("Contracts:");
        console.log("----------");
        console.log("LiquidationEngine: ", address(liquidationEngine));
        console.log("FundingManager:    ", address(fundingManager));
        console.log("Factory:           ", address(factory));
        console.log("Factory Owner:     ", factory.owner());
        console.log("");
        console.log("Config File:");
        console.log("------------");
        console.log("deployments.json");
        console.log("");
        console.log("Next Steps:");
        console.log("-----------");
        console.log("1. Run 02_SetupLocal.s.sol (for local/testnet)");
        console.log("2. Or create markets via web interface");
        console.log("3. Or use Factory.createMarket(usdcAddress, config)");
        console.log("");
    }
}
