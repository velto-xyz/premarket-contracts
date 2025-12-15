// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {PerpMarket} from "./PerpMarket.sol";

/**
 * @title FundingManager
 * @notice Shared funding calculation logic for all perpetual futures markets
 * @dev Maps to perp.js lines 421-438 (updateCarryForCurrentBlock)
 *
 * Carry mechanism:
 * - When long OI > short OI: longs pay shorts (positive carry index)
 * - When short OI > long OI: shorts pay longs (negative carry index)
 * - Carry accrues per block based on OI imbalance
 *
 * NOTE: This contract is stateless and shared across all markets.
 * Funding state is stored in PerpMarket.
 */
contract FundingManager {
    // ============ Constants ============

    uint256 public constant PRECISION = 1e18;

    /// @notice Base carry rate per block (from perp.js CONFIG line 87)
    /// 0.0001 = 0.01% per block
    int256 public constant BASE_CARRY_RATE_PER_BLOCK = int256(PRECISION) / 10000;

    /// @notice Carry sensitivity multiplier (from perp.js CONFIG line 88)
    int256 public constant CARRY_SENSITIVITY = 1 * int256(PRECISION);

    // ============ Events ============

    event CarryUpdated(
        uint256 indexed blockNumber,
        int256 cumulativeCarryIndex,
        int256 carryPerBlock,
        uint256 longOI,
        uint256 shortOI
    );

    // ============ External Functions ============

    /**
     * @notice Calculate new carry index for the current block
     * @dev Maps to perp.js lines 421-438
     *
     * Algorithm:
     * 1. Get total OI (long + short)
     * 2. If OI is zero, return current index
     * 3. Calculate imbalance ratio: (longOI - shortOI) / totalOI
     * 4. Calculate carry per block: BASE_RATE * SENSITIVITY * imbalanceRatio
     * 5. Return updated cumulative carry index
     *
     * Note: carryPerBlock can be positive (longs pay) or negative (shorts pay)
     * Note: Caller (PerpEngine) must update market state
     *
     * @param market PerpMarket to calculate funding for
     * @return newCarryIndex New cumulative carry index
     * @return carryPerBlock Carry per block (for event emission)
     */
    function calculateUpdatedCarry(PerpMarket market) external view returns (int256 newCarryIndex, int256 carryPerBlock) {
        // Get OI from market
        uint256 longOI = market.longOpenInterest();
        uint256 shortOI = market.shortOpenInterest();
        uint256 totalOI = longOI + shortOI;

        // Get current funding state
        int256 cumulativeCarryIndex = market.cumulativeCarryIndex();

        // If no open interest, no carry accrues
        if (totalOI == 0) {
            return (cumulativeCarryIndex, 0);
        }

        // Calculate imbalance: (longOI - shortOI) / totalOI
        // Range: [-1, 1] in 18 decimal space
        int256 imbalance = int256(longOI) - int256(shortOI);
        int256 imbalanceRatio = (imbalance * int256(PRECISION)) / int256(totalOI);

        // Calculate carry per block
        // carryPerBlock = BASE_CARRY_RATE * CARRY_SENSITIVITY * imbalanceRatio
        carryPerBlock = (BASE_CARRY_RATE_PER_BLOCK * CARRY_SENSITIVITY * imbalanceRatio) /
            (int256(PRECISION) * int256(PRECISION));

        // Update cumulative index
        newCarryIndex = cumulativeCarryIndex + carryPerBlock;
    }

    // ============ View Functions ============

    /**
     * @notice Get current cumulative carry index from market
     * @param market PerpMarket to query
     * @return Current carry index (can be positive or negative)
     */
    function getCurrentCarryIndex(PerpMarket market) external view returns (int256) {
        return market.cumulativeCarryIndex();
    }

    /**
     * @notice Calculate carry PnL for a position
     * @dev This is a helper function to calculate carry PnL without reading position state
     *
     * @param market PerpMarket to query
     * @param isLong True for long position, false for short
     * @param notional Position notional value (18 decimals)
     * @param carrySnapshot Carry index when position was opened
     * @return carryPnl Carry PnL (can be positive or negative)
     */
    function calculateCarryPnl(
        PerpMarket market,
        bool isLong,
        uint256 notional,
        int256 carrySnapshot
    ) external view returns (int256 carryPnl) {
        int256 deltaCarry = market.cumulativeCarryIndex() - carrySnapshot;

        // Longs pay when carry index increases (sideSign = -1)
        // Shorts receive when carry index increases (sideSign = +1)
        int256 sideSign = isLong ? int256(-1) : int256(1);

        carryPnl = (sideSign * int256(notional) * deltaCarry) / int256(PRECISION);
    }
}
