// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import {PerpEngine} from "./PerpEngine.sol";
import {PerpMarket} from "./PerpMarket.sol";
import {PositionManager} from "./PositionManager.sol";
import {FundingManager} from "./FundingManager.sol";
import {LiquidationEngine} from "./LiquidationEngine.sol";

/**
 * @title PerpFactory
 * @notice Factory for deploying independent perpetual futures markets
 * @dev Each market is isolated with its own:
 *      - vAMM reserves and parameters
 *      - Position manager
 *      - Funding manager
 *      - Insurance fund
 *
 * LiquidationEngine is shared across all markets for gas efficiency.
 *
 * This enables multiple markets (ETH-PERP, BTC-PERP, etc.) with different configurations
 */
contract PerpFactory {
    // ============ Structs ============

    struct MarketConfig {
        uint256 baseReserve;     // Initial base reserve (18 decimals)
        uint256 quoteReserve;    // Initial quote reserve (18 decimals)
        uint256 maxLeverage;     // Maximum leverage (18 decimals, e.g., 30e18 = 30x)
    }

    // ============ State Variables ============

    /// @notice Shared liquidation engine for all markets
    LiquidationEngine public immutable liquidationEngine;

    /// @notice Shared funding manager for all markets
    FundingManager public immutable fundingManager;

    /// @notice Array of all deployed engine addresses
    address[] public markets;

    /// @notice Check if an address is a deployed engine
    mapping(address => bool) public isEngine;

    // ============ Events ============

    event MarketCreated(
        uint256 indexed marketIndex,
        address indexed engine,
        address market,
        address collateralToken
    );

    // ============ Errors ============

    error InvalidReserves();
    error InvalidLeverage();

    // ============ Constructor ============

    constructor(LiquidationEngine _liquidationEngine, FundingManager _fundingManager) {
        liquidationEngine = _liquidationEngine;
        fundingManager = _fundingManager;
    }

    // ============ External Functions ============

    /**
     * @notice Create a new perpetual futures market
     * @dev Deploys all necessary contracts for an isolated market
     *
     * @param collateralToken Address of collateral token (e.g., USDC)
     * @param config Market configuration parameters
     * @return engineAddress Address of the deployed PerpEngine
     */
    function createMarket(address collateralToken, MarketConfig memory config)
        public
        returns (address engineAddress)
    {
        // Validation
        if (config.baseReserve == 0 || config.quoteReserve == 0) revert InvalidReserves();
        if (config.maxLeverage == 0 || config.maxLeverage > 30e18) revert InvalidLeverage();

        // Deploy contracts in order (dependencies matter)

        // 1. Deploy PerpMarket (vAMM)
        PerpMarket market = new PerpMarket(config.baseReserve, config.quoteReserve);

        // 2. Deploy PositionManager
        PositionManager positionManager = new PositionManager(
            address(this),
            market
        );

        // 3. Deploy PerpEngine (main orchestrator) with shared instances
        PerpEngine engine = new PerpEngine(
            collateralToken,
            market,
            positionManager,
            fundingManager,    // Use shared instance
            liquidationEngine  // Use shared instance
        );

        engineAddress = address(engine);

        // 4. Set engine address on contracts that need it
        market.setEngine(engineAddress);
        positionManager.setEngine(engineAddress);
        // Note: No setEngine for fundingManager or liquidationEngine - they're shared and stateless

        // Store engine address
        markets.push(address(engine));
        isEngine[address(engine)] = true;

        emit MarketCreated(
            markets.length - 1,
            address(engine),
            address(market),
            collateralToken
        );
    }

    // ============ View Functions ============

    /**
     * @notice Get total number of deployed markets
     */
    function getMarketCount() external view returns (uint256) {
        return markets.length;
    }

    /**
     * @notice Get engine address by index
     * @param index Market index
     * @return engine Engine address
     */
    function getMarket(uint256 index) external view returns (address) {
        require(index < markets.length, "Invalid market index");
        return markets[index];
    }

    /**
     * @notice Get all deployed engine addresses
     * @return allMarkets Array of all engine addresses
     */
    function getAllMarkets() external view returns (address[] memory) {
        return markets;
    }
}
