// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "forge-std/Script.sol";
import "../src/PerpFactory.sol";
import "../src/LiquidationEngine.sol";
import "../src/FundingManager.sol";

/**
 * @title 01_DeployCore
 * @notice Deploy core perpetual DEX contracts using clone pattern
 * @dev Network-agnostic deployment - works on any chain
 *      Deploys: Implementation contracts, LiquidationEngine, FundingManager, PerpFactory
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

        console.log("\n=== Deploying Perp DEX Core (Clone Pattern) ===");
        console.log("Chain ID:", chainId);
        console.log("Deployer:", deployer);
        console.log("");

        // 1. Deploy implementation contracts (deployed once, cloned for each market)
        console.log("1. Deploying implementation contracts...");

        // Deploy PerpMarket implementation (empty initialization)
        PerpMarket perpMarketImpl = new PerpMarket();
        console.log("   PerpMarket implementation:", address(perpMarketImpl));

        // Deploy PositionManager implementation (empty initialization)
        PositionManager positionManagerImpl = new PositionManager();
        console.log("   PositionManager implementation:", address(positionManagerImpl));

        // Deploy PerpEngine implementation (empty initialization)
        PerpEngine perpEngineImpl = new PerpEngine();
        console.log("   PerpEngine implementation:", address(perpEngineImpl));

        // 2. Deploy shared LiquidationEngine
        console.log("\n2. Deploying shared LiquidationEngine...");
        LiquidationEngine liquidationEngine = new LiquidationEngine();
        console.log("   Address:", address(liquidationEngine));

        // 3. Deploy shared FundingManager
        console.log("\n3. Deploying shared FundingManager...");
        FundingManager fundingManager = new FundingManager();
        console.log("   Address:", address(fundingManager));

        // 4. Deploy PerpFactory with implementation addresses
        console.log("\n4. Deploying PerpFactory...");
        PerpFactory factory = new PerpFactory(
            address(perpMarketImpl),
            address(positionManagerImpl),
            address(perpEngineImpl),
            liquidationEngine,
            fundingManager
        );
        console.log("   Address:", address(factory));
        console.log("   Owner:", factory.owner());

        vm.stopBroadcast();

        // 5. Write addresses to deployments.json
        console.log("\n5. Writing addresses to deployments.json");

        string memory deploymentsFile = "deployments.json";
        string memory existingJson = "{}";

        // Try to read existing deployments
        try vm.readFile(deploymentsFile) returns (string memory content) {
            existingJson = content;
        } catch {}

        // Build new deployment entry with implementation addresses
        string memory deployment = string.concat(
            '{"factory":"', vm.toString(address(factory)),
            '","liquidationEngine":"', vm.toString(address(liquidationEngine)),
            '","fundingManager":"', vm.toString(address(fundingManager)),
            '","perpMarketImpl":"', vm.toString(address(perpMarketImpl)),
            '","positionManagerImpl":"', vm.toString(address(positionManagerImpl)),
            '","perpEngineImpl":"', vm.toString(address(perpEngineImpl)),
            '","deployer":"', vm.toString(deployer),
            '","timestamp":', vm.toString(block.timestamp),
            ',"deploymentBlock":', vm.toString(block.number), '}'
        );

        // Manual JSON merge (simple approach for single chain update)
        string memory chainKey = vm.toString(chainId);
        vm.writeJson(deployment, deploymentsFile, string.concat(".", chainKey));

        // 6. Summary
        console.log("\n=== Deployment Complete ===\n");
        console.log("Network:");
        console.log("--------");
        console.log("Chain ID:", chainId);
        console.log("Deployer:", deployer);
        console.log("");
        console.log("Implementation Contracts (Clone Pattern):");
        console.log("-----------------------------------------");
        console.log("PerpMarket impl:       ", address(perpMarketImpl));
        console.log("PositionManager impl:  ", address(positionManagerImpl));
        console.log("PerpEngine impl:       ", address(perpEngineImpl));
        console.log("");
        console.log("Shared Contracts:");
        console.log("-----------------");
        console.log("LiquidationEngine:     ", address(liquidationEngine));
        console.log("FundingManager:        ", address(fundingManager));
        console.log("");
        console.log("Factory:");
        console.log("--------");
        console.log("Factory:               ", address(factory));
        console.log("Factory Owner:         ", factory.owner());
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
        console.log("4. Markets will be created as clones (~98% gas savings)");
        console.log("");
    }
}
