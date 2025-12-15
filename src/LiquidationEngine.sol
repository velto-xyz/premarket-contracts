// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {PositionManager} from "./PositionManager.sol";
import {PerpMarket} from "./PerpMarket.sol";

/**
 * @title LiquidationEngine
 * @notice Shared liquidation logic for all perpetual futures markets
 * @dev Maps to perp.js lines 1042-1119 (isLiquidatable) and 1253-1339 (liquidatePosition)
 *
 * Liquidation system:
 * - Dynamic buffer ratios based on leverage (10% for ≤10x, 20% for ≤20x, 30% for >20x)
 * - Positions are liquidatable when: currentLoss > allowedLoss
 * - Where: allowedLoss = margin * (1 - bufferRatio)
 * - Same-block liquidation protection (can't liquidate in opening block)
 *
 * NOTE: This contract is stateless and shared across all markets.
 * PositionManager and PerpMarket are passed as function parameters.
 */
contract LiquidationEngine {
    // ============ Constants ============

    uint256 public constant PRECISION = 1e18;
    uint256 public constant EPSILON = 1e12; // 1e-6 in 18 decimal space (matches perp.js line 1108)

    /// @notice Liquidation fee ratio (from perp.js CONFIG line 58)
    /// 0.005 = 0.5% of close notional goes to liquidator
    uint256 public constant LIQUIDATION_FEE_RATIO = PRECISION / 200;

    // ============ Events ============

    event PositionLiquidated(
        uint256 indexed positionId,
        address indexed user,
        address indexed liquidator,
        uint256 avgClosePrice,
        int256 totalPnl,
        int256 equity,
        uint256 liqFee,
        uint256 timestamp
    );

    // ============ Errors ============

    error PositionNotLiquidatable();
    error PositionNotOpen();

    // ============ External Functions ============

    /**
     * @notice Check if a position is liquidatable
     * @dev Maps to perp.js lines 1042-1119
     *
     * Algorithm:
     * 1. Check position exists and is OPEN
     * 2. Check same-block protection (openBlock != currentBlock)
     * 3. Simulate equity if closed now
     * 4. Calculate current leverage
     * 5. Get buffer ratio from leverage bucket
     * 6. Calculate currentLoss = max(0, margin - equity)
     * 7. Calculate allowedLoss = margin * (1 - bufferRatio)
     * 8. Liquidatable if currentLoss > allowedLoss + EPSILON
     *
     * @param positionManager PositionManager for this market
     * @param market PerpMarket for this market
     * @param positionId Position ID to check
     * @return True if position can be liquidated
     */
    function isLiquidatable(
        PositionManager positionManager,
        PerpMarket market,
        uint256 positionId
    ) public view returns (bool) {
        // Step 1: Check if position exists and is open
        if (!positionManager.isPositionOpen(positionId)) {
            return false;
        }

        PositionManager.Position memory position = positionManager.getPosition(positionId);

        // Step 2: Same-block protection (perp.js lines 1051-1055)
        // Cannot liquidate in the same block position was opened
        if (position.openBlock == market.currentBlock()) {
            return false;
        }

        // Step 3: Simulate equity if closed now (perp.js line 1062)
        (,, int256 pnlTrade, int256 carryPnl, int256 totalPnl, int256 equityIfClosed) =
            positionManager.simulateEquityIfClosed(positionId);

        // Step 4: Calculate current leverage (perp.js lines 1070-1072)
        uint256 markPrice = market.getMarkPrice();
        uint256 notionalNow = (position.baseSize * markPrice) / PRECISION;
        uint256 leverage = (notionalNow * PRECISION) / position.margin;

        // Step 5: Get buffer ratio from leverage bucket (perp.js line 1081)
        uint256 bufferRatio = positionManager.getLiquidationBufferRatio(leverage);

        // Step 6-7: Calculate losses (perp.js lines 1097-1101)
        uint256 M = position.margin;
        int256 E = equityIfClosed;

        // currentLoss = max(0, M - E)
        uint256 currentLoss;
        if (int256(M) > E) {
            currentLoss = uint256(int256(M) - E);
        } else {
            currentLoss = 0; // Position is profitable, no loss
        }

        // allowedLoss = M * (1 - bufferRatio)
        uint256 allowedLoss = (M * (PRECISION - bufferRatio)) / PRECISION;

        // Step 8: Compare with epsilon (perp.js lines 1110-1114)
        // Liquidatable if currentLoss > allowedLoss + EPSILON
        return currentLoss > allowedLoss + EPSILON;
    }

    /**
     * @notice Get liquidation information for a position
     * @dev Useful for keepers to decide if liquidation is profitable
     *
     * @param positionManager PositionManager for this market
     * @param market PerpMarket for this market
     * @param positionId Position ID
     * @return isLiq True if position is liquidatable
     * @return currentLoss Current loss if closed now
     * @return allowedLoss Maximum allowed loss before liquidation
     * @return equity Current equity if closed
     * @return leverage Current leverage
     */
    function getLiquidationInfo(
        PositionManager positionManager,
        PerpMarket market,
        uint256 positionId
    )
        external
        view
        returns (
            bool isLiq,
            uint256 currentLoss,
            uint256 allowedLoss,
            int256 equity,
            uint256 leverage
        )
    {
        if (!positionManager.isPositionOpen(positionId)) {
            return (false, 0, 0, 0, 0);
        }

        PositionManager.Position memory position = positionManager.getPosition(positionId);

        // Simulate equity
        (,,,, , int256 equityIfClosed) = positionManager.simulateEquityIfClosed(positionId);
        equity = equityIfClosed;

        // Calculate leverage
        uint256 markPrice = market.getMarkPrice();
        uint256 notionalNow = (position.baseSize * markPrice) / PRECISION;
        leverage = (notionalNow * PRECISION) / position.margin;

        // Get buffer ratio
        uint256 bufferRatio = positionManager.getLiquidationBufferRatio(leverage);

        // Calculate losses
        uint256 M = position.margin;
        if (int256(M) > equityIfClosed) {
            currentLoss = uint256(int256(M) - equityIfClosed);
        }

        allowedLoss = (M * (PRECISION - bufferRatio)) / PRECISION;
        isLiq = currentLoss > allowedLoss + EPSILON;
    }

    /**
     * @notice Calculate liquidation fee for a position
     * @param positionManager PositionManager for this market
     * @param market PerpMarket for this market
     * @param positionId Position ID
     * @return liqFee Liquidation fee amount
     */
    function calculateLiquidationFee(
        PositionManager positionManager,
        PerpMarket market,
        uint256 positionId
    )
        external
        view
        returns (uint256 liqFee)
    {
        PositionManager.Position memory position = positionManager.getPosition(positionId);

        // Get close notional
        uint256 closeNotional;
        if (position.isLong) {
            (closeNotional,) = market.simulateCloseLong(position.baseSize);
        } else {
            (closeNotional,) = market.simulateCloseShort(position.baseSize);
        }

        // Liquidation fee = closeNotional * LIQUIDATION_FEE_RATIO
        liqFee = (closeNotional * LIQUIDATION_FEE_RATIO) / PRECISION;
    }
}
