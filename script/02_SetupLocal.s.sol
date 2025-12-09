// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import "forge-std/Script.sol";
import "../src/PerpFactory.sol";
import "../src/MockUSDC.sol";

/**
 * @title 02_SetupLocal
 * @notice Setup local/testnet environment
 * @dev Deploys MockUSDC, creates test markets, mints test tokens
 *      Reads Factory address from deployments.json
 *
 * Prerequisites:
 *   - Must run 01_DeployCore.s.sol first
 *   - Factory address must be in deployments.json
 *
 * Usage:
 *   forge script script/02_SetupLocal.s.sol --rpc-url http://localhost:8545 --broadcast
 */
contract SetupLocal is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        uint256 chainId = block.chainid;

        // Load factory address from deployments.json
        string memory deploymentsFile = "deployments.json";
        string memory json = vm.readFile(deploymentsFile);
        string memory chainKey = string.concat(".", vm.toString(chainId));
        address factoryAddress = vm.parseJsonAddress(json, string.concat(chainKey, ".factory"));

        console.log("\n=== Setting Up Local/Testnet Environment ===");
        console.log("Chain ID:", chainId);
        console.log("Factory:", factoryAddress);
        console.log("");

        vm.startBroadcast(deployerPrivateKey);

        PerpFactory factory = PerpFactory(factoryAddress);

        // 1. Deploy MockUSDC
        console.log("1. Deploying MockUSDC...");
        MockUSDC usdc = new MockUSDC();
        console.log("   Address:", address(usdc));

        // 2. Create test markets with realistic valuations
        console.log("\n2. Creating test markets...");

        // SPACEX: Tier 1 - $2000 price, $50M liquidity (established unicorn)
        PerpFactory.MarketConfig memory spacexConfig = PerpFactory.MarketConfig({
            baseReserve: 25_000 * 1e18,
            quoteReserve: 50_000_000 * 1e18,
            maxLeverage: 30 * 1e18
        });
        address spacexEngine = factory.createMarket(address(usdc), spacexConfig);
        console.log("   SPACEX-PERP: ", spacexEngine, "(Price: $2000, Pool: $50M)");

        // STRIPE: Tier 2 - $500 price, $10M liquidity (mid-stage growth)
        PerpFactory.MarketConfig memory stripeConfig = PerpFactory.MarketConfig({
            baseReserve: 20_000 * 1e18,
            quoteReserve: 10_000_000 * 1e18,
            maxLeverage: 25 * 1e18
        });
        address stripeEngine = factory.createMarket(address(usdc), stripeConfig);
        console.log("   STRIPE-PERP: ", stripeEngine, "(Price: $500, Pool: $10M)");

        // VELTO: Tier 3 - $100 price, $1M liquidity (early stage)
        PerpFactory.MarketConfig memory veltoConfig = PerpFactory.MarketConfig({
            baseReserve: 10_000 * 1e18,
            quoteReserve: 1_000_000 * 1e18,
            maxLeverage: 20 * 1e18
        });
        address veltoEngine = factory.createMarket(address(usdc), veltoConfig);
        console.log("   VELTO-PERP:  ", veltoEngine, "(Price: $100, Pool: $1M)");

        // 3. Setup test accounts (Anvil accounts)
        console.log("\n3. Setting up test accounts...");

        address alice = address(0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266); // Anvil #0
        address bob = address(0x70997970C51812dc3A010C7d01b50e0d17dc79C8);   // Anvil #1
        address carol = address(0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC);  // Anvil #2
        address dave = address(0x90F79bf6EB2c4f870365E785982E1f101E93b906);   // Anvil #3
        address eve = address(0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65);    // Anvil #4

        console.log("   Alice:", alice);
        console.log("   Bob:", bob);
        console.log("   Carol:", carol);
        console.log("   Dave:", dave);
        console.log("   Eve:", eve);

        // 4. Mint test USDC
        console.log("\n4. Minting test USDC (10,000 each)...");
        uint256 mintAmount = 10_000 * 1e6; // 10k USDC (6 decimals)

        usdc.mint(alice, mintAmount);
        usdc.mint(bob, mintAmount);
        usdc.mint(carol, mintAmount);
        usdc.mint(dave, mintAmount);
        usdc.mint(eve, mintAmount);

        console.log("   Minted 10,000 USDC to 5 accounts");

        vm.stopBroadcast();

        // 5. Add USDC address to deployments.json
        console.log("\n5. Updating deployments.json with USDC address");

        string memory usdcAddress = vm.toString(address(usdc));
        vm.writeJson(usdcAddress, deploymentsFile, string.concat(chainKey, ".usdc"));

        // 6. Summary
        console.log("\n=== Setup Complete ===\n");
        console.log("MockUSDC:      ", address(usdc));
        console.log("");
        console.log("Markets:");
        console.log("--------");
        console.log("SPACEX-PERP:   ", spacexEngine, " ($2000, $50M pool)");
        console.log("STRIPE-PERP:   ", stripeEngine, " ($500, $10M pool)");
        console.log("VELTO-PERP:    ", veltoEngine, "  ($100, $1M pool)");
        console.log("");
        console.log("Test Accounts:");
        console.log("--------------");
        console.log("Alice (Anvil #0): 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266");
        console.log("Bob (Anvil #1):   0x70997970C51812dc3A010C7d01b50e0d17dc79C8");
        console.log("Carol (Anvil #2): 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC");
        console.log("Dave (Anvil #3):  0x90F79bf6EB2c4f870365E785982E1f101E93b906");
        console.log("Eve (Anvil #4):   0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65");
        console.log("");
        console.log("Next Steps:");
        console.log("-----------");
        console.log("1. Run: task web:dev");
        console.log("2. Open: http://localhost:5173");
        console.log("3. Connect with Anvil account #0");
        console.log("");
    }
}
