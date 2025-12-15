// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {PerpMarket} from "./PerpMarket.sol";
import {Initializable} from "@openzeppelin/contracts/proxy/utils/Initializable.sol";

/**
 * @title PositionManager
 * @notice Manages perpetual futures positions and calculates position health
 * @dev Maps to perp.js lines 198-225 (createPosition) and 905-958 (simulateEquityIfClosedNow)
 */
contract PositionManager is Initializable {
    // ============ Structs ============

    enum PositionStatus {
        OPEN,
        CLOSED,
        LIQUIDATED
    }

    struct Position {
        uint256 id;
        address user;
        bool isLong;
        uint256 baseSize;        // Position size in base asset (18 decimals)
        uint256 entryPrice;      // Average entry price (18 decimals)
        uint256 entryNotional;   // baseSize * entryPrice (18 decimals)
        uint256 margin;          // Locked collateral (18 decimals)
        int256 carrySnapshot;    // Carry index at open (18 decimals, can be negative)
        uint256 openBlock;       // Block number when opened
        PositionStatus status;
        int256 realizedPnl;      // PnL when closed/liquidated (18 decimals)
    }

    // ============ Constants ============

    uint256 public constant PRECISION = 1e18;

    /// @notice Leverage buckets for dynamic liquidation buffers
    /// Maps to perp.js lines 73-77
    uint256 public constant LEVERAGE_BUCKET_1_MAX = 10 * PRECISION;  // 0-10x
    uint256 public constant LEVERAGE_BUCKET_2_MAX = 20 * PRECISION;  // 10-20x
    uint256 public constant LEVERAGE_BUCKET_3_MAX = 30 * PRECISION;  // 20-30x

    uint256 public constant BUFFER_RATIO_1 = PRECISION / 10; // 10% for 0-10x
    uint256 public constant BUFFER_RATIO_2 = PRECISION / 5;  // 20% for 10-20x
    uint256 public constant BUFFER_RATIO_3 = 3 * PRECISION / 10; // 30% for 20-30x

    // ============ State Variables ============

    /// @notice Address of PerpEngine (only engine can modify state)
    address public engine;

    /// @notice Address of deployer/factory (can set engine once)
    address public factory;

    /// @notice Reference to PerpMarket for vAMM operations
    PerpMarket public market;

    /// @notice Mapping of position ID to Position
    mapping(uint256 => Position) public positions;

    /// @notice Next position ID (incremental)
    uint256 public nextPositionId;

    // ============ Events ============

    event PositionCreated(
        uint256 indexed positionId,
        address indexed user,
        bool indexed isLong,
        uint256 baseSize,
        uint256 entryPrice,
        uint256 entryNotional,
        uint256 margin,
        int256 carrySnapshot,
        uint256 openBlock
    );

    // ============ Errors ============

    error Unauthorized();
    error PositionNotFound();
    error PositionNotOpen();
    error EngineAlreadySet();

    // ============ Modifiers ============

    modifier onlyEngine() {
        if (msg.sender != engine) revert Unauthorized();
        _;
    }

    // ============ Initialization ============

    /**
     * @notice Initialize the position manager (replaces constructor for clone pattern)
     * @param _market PerpMarket address
     * @param _factory Factory address that can set engine
     */
    function initialize(PerpMarket _market, address _factory) external initializer {
        factory = _factory; // Save factory address for setEngine
        market = _market;
        nextPositionId = 1; // Start at 1
    }

    /**
     * @notice Set the engine address (can only be called once by factory)
     * @param _engine Address of PerpEngine
     */
    function setEngine(address _engine) external {
        if (msg.sender != factory) revert Unauthorized();
        if (engine != address(0)) revert EngineAlreadySet();
        engine = _engine;
    }

    // ============ External Functions (Engine Only) ============

    /**
     * @notice Create a new position
     * @dev Maps to perp.js lines 199-225
     *
     * @param user Address of position owner
     * @param isLong True for long, false for short
     * @param baseSize Position size in base asset
     * @param entryPrice Average entry price
     * @param margin Locked collateral
     * @param carrySnapshot Current carry index at open
     * @return positionId The ID of the created position
     */
    function createPosition(
        address user,
        bool isLong,
        uint256 baseSize,
        uint256 entryPrice,
        uint256 margin,
        int256 carrySnapshot
    ) external onlyEngine returns (uint256 positionId) {
        positionId = nextPositionId++;

        uint256 entryNotional = (baseSize * entryPrice) / PRECISION;

        positions[positionId] = Position({
            id: positionId,
            user: user,
            isLong: isLong,
            baseSize: baseSize,
            entryPrice: entryPrice,
            entryNotional: entryNotional,
            margin: margin,
            carrySnapshot: carrySnapshot,
            openBlock: market.currentBlock(),
            status: PositionStatus.OPEN,
            realizedPnl: 0
        });

        emit PositionCreated(
            positionId,
            user,
            isLong,
            baseSize,
            entryPrice,
            entryNotional,
            margin,
            carrySnapshot,
            market.currentBlock()
        );
    }

    /**
     * @notice Update position status and realized PnL
     * @param positionId Position ID
     * @param newStatus New status (CLOSED or LIQUIDATED)
     * @param realizedPnl Final realized PnL
     */
    function updatePositionStatus(
        uint256 positionId,
        PositionStatus newStatus,
        int256 realizedPnl
    ) external onlyEngine {
        Position storage position = positions[positionId];
        if (position.status != PositionStatus.OPEN) revert PositionNotOpen();

        position.status = newStatus;
        position.realizedPnl = realizedPnl;
    }

    // ============ View Functions ============

    /**
     * @notice Get liquidation buffer ratio based on leverage
     * @dev Maps to perp.js lines 120-125
     *
     * @param leverage Current leverage (18 decimals)
     * @return bufferRatio Buffer ratio (18 decimals)
     */
    function getLiquidationBufferRatio(uint256 leverage) public pure returns (uint256) {
        if (leverage <= LEVERAGE_BUCKET_1_MAX) {
            return BUFFER_RATIO_1; // 10%
        } else if (leverage <= LEVERAGE_BUCKET_2_MAX) {
            return BUFFER_RATIO_2; // 20%
        } else {
            return BUFFER_RATIO_3; // 30%
        }
    }

    /**
     * @notice Simulate equity if position was closed now
     * @dev Maps to perp.js lines 905-958
     *
     * This is THE CRITICAL function for liquidations. It calculates:
     * 1. What price we'd get if we closed on vAMM right now
     * 2. Trading PnL (difference between entry and exit)
     * 3. Carry PnL (funding payments accumulated)
     * 4. Total equity = margin + trading PnL + carry PnL
     *
     * @param positionId Position ID
     * @return closeNotional Notional value if closed (quote amount)
     * @return avgClosePrice Average close price
     * @return pnlTrade Trading PnL (can be negative)
     * @return carryPnl Carry PnL (can be negative)
     * @return totalPnl Total PnL (trading + carry)
     * @return equityIfClosed Final equity (margin + totalPnL)
     */
    function simulateEquityIfClosed(uint256 positionId)
        public
        view
        returns (
            uint256 closeNotional,
            uint256 avgClosePrice,
            int256 pnlTrade,
            int256 carryPnl,
            int256 totalPnl,
            int256 equityIfClosed
        )
    {
        Position memory position = positions[positionId];
        if (position.status != PositionStatus.OPEN) revert PositionNotOpen();

        // Step 1: Simulate closing on vAMM (perp.js lines 914-922)
        if (position.isLong) {
            // Close long = sell base for quote
            (closeNotional, avgClosePrice) = market.simulateCloseLong(position.baseSize);
        } else {
            // Close short = buy base with quote
            (closeNotional, avgClosePrice) = market.simulateCloseShort(position.baseSize);
        }

        // Step 2: Calculate trading PnL (perp.js lines 924-932)
        if (position.isLong) {
            // Long profit: closeNotional > entryNotional
            pnlTrade = int256(closeNotional) - int256(position.entryNotional);
        } else {
            // Short profit: entryNotional > closeNotional
            pnlTrade = int256(position.entryNotional) - int256(closeNotional);
        }

        // Step 3: Calculate carry PnL (perp.js lines 934-944)
        uint256 markPrice = market.getMarkPrice();
        uint256 notionalNow = (position.baseSize * markPrice) / PRECISION;
        int256 deltaCarry = market.cumulativeCarryIndex() - position.carrySnapshot;

        // sideSign: longs pay when index increases (-1), shorts receive (+1)
        int256 sideSign = position.isLong ? int256(-1) : int256(1);
        // Safe carry calculation to prevent overflow
        uint256 absCarry = deltaCarry >= 0 ? uint256(deltaCarry) : uint256(-deltaCarry);
        uint256 carryMagnitude = (notionalNow * absCarry) / PRECISION;
        carryPnl = int256(carryMagnitude) * sideSign * (deltaCarry >= 0 ? int256(1) : int256(-1));

        // Step 4: Total PnL and equity (perp.js lines 946-948)
        totalPnl = pnlTrade + carryPnl;
        equityIfClosed = int256(position.margin) + totalPnl;
    }

    /**
     * @notice Get effective open fee rate (OI-skewed)
     * @dev Maps to perp.js lines 606-619
     *
     * Fee rate increases with OI imbalance:
     * feeRate = BASE_FEE_RATE * (1 + |imbalanceRatio| * OI_SKEW_MULTIPLIER)
     *
     * @return feeRate Effective fee rate (18 decimals, e.g., 0.001e18 = 0.1%)
     */
    function getEffectiveOpenFeeRate() external view returns (uint256 feeRate) {
        uint256 longOI = market.longOpenInterest();
        uint256 shortOI = market.shortOpenInterest();
        uint256 totalOI = longOI + shortOI;

        if (totalOI == 0) {
            // No OI, return base fee rate (0.1% = 0.001e18)
            return PRECISION / 1000;
        }

        // Calculate imbalance ratio: (longOI - shortOI) / totalOI
        // Range: [-1, 1] in absolute terms
        int256 imbalance = int256(longOI) - int256(shortOI);
        uint256 absImbalance = imbalance >= 0 ? uint256(imbalance) : uint256(-imbalance);
        uint256 imbalanceRatio = (absImbalance * PRECISION) / totalOI;

        // feeRate = BASE_FEE_RATE * (1 + imbalanceRatio * OI_SKEW_MULTIPLIER)
        // From perp.js CONFIG: BASE_OPEN_FEE_RATE = 0.001, OI_SKEW_FEE_MULTIPLIER = 1.0
        uint256 baseFeeRate = PRECISION / 1000;
        uint256 oiSkewMultiplier = 1 * PRECISION;

        uint256 skewAdjustment = (imbalanceRatio * oiSkewMultiplier) / PRECISION;
        feeRate = (baseFeeRate * (PRECISION + skewAdjustment)) / PRECISION;
    }

    /**
     * @notice Get position details
     * @param positionId Position ID
     * @return position The position struct
     */
    function getPosition(uint256 positionId) external view returns (Position memory) {
        if (positions[positionId].id == 0) revert PositionNotFound();
        return positions[positionId];
    }

    /**
     * @notice Check if position exists and is open
     * @param positionId Position ID
     * @return True if position exists and is open
     */
    function isPositionOpen(uint256 positionId) external view returns (bool) {
        Position memory position = positions[positionId];
        return position.id != 0 && position.status == PositionStatus.OPEN;
    }
}
