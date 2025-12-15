// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Initializable} from "@openzeppelin/contracts/proxy/utils/Initializable.sol";

/**
 * @title PerpMarket
 * @notice Virtual AMM (vAMM) for perpetual futures trading
 * @dev Implements constant product market maker: k = baseReserve * quoteReserve
 *
 * Maps to perp.js lines 460-571 (vAMM simulation functions)
 * Critical: All math must match JavaScript implementation within 1e-15 precision
 */
contract PerpMarket is Initializable {
    // ============ Constants ============

    uint256 public constant PRECISION = 1e18;

    // ============ State Variables ============

    /// @notice Virtual base asset reserve (18 decimals)
    uint256 public baseReserve;

    /// @notice Virtual quote asset reserve (18 decimals)
    uint256 public quoteReserve;

    /// @notice Cached invariant: k = baseReserve * quoteReserve
    /// @dev Cached to save gas vs recalculating each time
    uint256 public k;

    /// @notice Total notional value of long positions (18 decimals)
    uint256 public longOpenInterest;

    /// @notice Total notional value of short positions (18 decimals)
    uint256 public shortOpenInterest;

    /// @notice Current block number (for carry calculations)
    uint256 public currentBlock;

    /// @notice Cumulative carry index (can be positive or negative)
    /// @dev This accumulates over time. Longs pay when positive, shorts when negative
    int256 public cumulativeCarryIndex;

    /// @notice Last block when carry was updated
    uint256 public lastFundingBlock;

    /// @notice Address of PerpEngine (only engine can modify state)
    address public engine;

    /// @notice Address of deployer/factory (can set engine once)
    address public factory;

    // ============ Events ============

    event ReservesUpdated(
        uint256 baseReserve,
        uint256 quoteReserve,
        uint256 markPrice
    );

    event OpenInterestUpdated(
        uint256 longOpenInterest,
        uint256 shortOpenInterest
    );

    // ============ Errors ============

    error Unauthorized();
    error InvalidReserves();
    error InsufficientLiquidity();
    error EngineAlreadySet();

    // ============ Modifiers ============

    modifier onlyEngine() {
        if (msg.sender != engine) revert Unauthorized();
        _;
    }

    // ============ Initialization ============

    /**
     * @notice Initialize the market (replaces constructor for clone pattern)
     * @param _baseReserve Initial base reserve (18 decimals)
     * @param _quoteReserve Initial quote reserve (18 decimals)
     * @param _factory Factory address that can set engine
     */
    function initialize(uint256 _baseReserve, uint256 _quoteReserve, address _factory) external initializer {
        if (_baseReserve == 0 || _quoteReserve == 0) revert InvalidReserves();

        baseReserve = _baseReserve;
        quoteReserve = _quoteReserve;
        k = _baseReserve * _quoteReserve;
        currentBlock = 1; // Start at block 1
        cumulativeCarryIndex = 0; // Start at 0
        lastFundingBlock = 1; // Match currentBlock
        factory = _factory; // Save factory address for setEngine
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

    // ============ View Functions ============

    /**
     * @notice Get current mark price (spot price from vAMM)
     * @dev Mark price = quoteReserve / baseReserve
     * @return Mark price in 18 decimal precision
     *
     * Maps to perp.js lines 364-366
     */
    function getMarkPrice() public view returns (uint256) {
        return (quoteReserve * PRECISION) / baseReserve;
    }

    // ============ vAMM Simulation Functions (Read-Only) ============

    /**
     * @notice Simulate opening a long position (buying base with quote)
     * @param quoteIn Amount of quote tokens to spend (18 decimals)
     * @return baseOut Amount of base tokens received
     * @return avgPrice Average execution price
     *
     * Maps to perp.js lines 472-487
     *
     * Math:
     * - newQuoteReserve = quoteReserve + quoteIn
     * - newBaseReserve = k / newQuoteReserve
     * - baseOut = baseReserve - newBaseReserve
     * - avgPrice = quoteIn / baseOut
     */
    function simulateOpenLong(uint256 quoteIn)
        public
        view
        returns (uint256 baseOut, uint256 avgPrice)
    {
        if (quoteIn == 0) return (0, 0);

        // Step 1: Add quote to reserves
        uint256 newQuoteReserve = quoteReserve + quoteIn;

        // Step 2: Calculate new base reserve using invariant with ceiling division
        // This ensures we round in favor of the pool (give user less baseOut)
        // newBaseReserve = ceil(k / newQuoteReserve) = (k + newQuoteReserve - 1) / newQuoteReserve
        uint256 newBaseReserve = (k + newQuoteReserve - 1) / newQuoteReserve;

        // Step 3: Base out is the difference
        baseOut = baseReserve - newBaseReserve;

        // Step 4: Average price = quoteIn / baseOut
        avgPrice = (quoteIn * PRECISION) / baseOut;
    }

    /**
     * @notice Simulate opening a short position (selling base for quote)
     * @param quoteOut Desired notional value in quote tokens (18 decimals)
     * @return baseIn Amount of base tokens required
     * @return avgPrice Average execution price
     *
     * Maps to perp.js lines 502-519
     *
     * Math:
     * - newQuoteReserve = quoteReserve - quoteOut
     * - newBaseReserve = k / newQuoteReserve
     * - baseIn = newBaseReserve - baseReserve
     * - avgPrice = quoteOut / baseIn
     */
    function simulateOpenShort(uint256 quoteOut)
        public
        view
        returns (uint256 baseIn, uint256 avgPrice)
    {
        if (quoteOut == 0) return (0, 0);
        if (quoteOut >= quoteReserve) revert InsufficientLiquidity();

        // Step 1: Remove quote from reserves
        uint256 newQuoteReserve = quoteReserve - quoteOut;

        // Step 2: Calculate new base reserve using invariant with ceiling division
        // This ensures we round in favor of the pool (user pays more baseIn)
        uint256 newBaseReserve = (k + newQuoteReserve - 1) / newQuoteReserve;

        // Step 3: Base in is the difference
        baseIn = newBaseReserve - baseReserve;

        // Step 4: Average price = quoteOut / baseIn
        avgPrice = (quoteOut * PRECISION) / baseIn;
    }

    /**
     * @notice Simulate closing a long position (selling base for quote)
     * @param baseSize Amount of base tokens to sell (18 decimals)
     * @return quoteOut Amount of quote tokens received
     * @return avgPrice Average execution price
     *
     * Maps to perp.js lines 533-544
     *
     * Math:
     * - newBaseReserve = baseReserve + baseSize
     * - newQuoteReserve = k / newBaseReserve
     * - quoteOut = quoteReserve - newQuoteReserve
     * - avgPrice = quoteOut / baseSize
     */
    function simulateCloseLong(uint256 baseSize)
        public
        view
        returns (uint256 quoteOut, uint256 avgPrice)
    {
        if (baseSize == 0) return (0, 0);

        // Step 1: Add base to reserves
        uint256 newBaseReserve = baseReserve + baseSize;

        // Step 2: Calculate new quote reserve using invariant with ceiling division
        // This ensures we round in favor of the pool (give user less quoteOut)
        uint256 newQuoteReserve = (k + newBaseReserve - 1) / newBaseReserve;

        // Step 3: Quote out is the difference
        quoteOut = quoteReserve - newQuoteReserve;

        // Step 4: Average price = quoteOut / baseSize
        avgPrice = (quoteOut * PRECISION) / baseSize;
    }

    /**
     * @notice Simulate closing a short position (buying base with quote)
     * @param baseSize Amount of base tokens to buy (18 decimals)
     * @return quoteIn Amount of quote tokens required
     * @return avgPrice Average execution price
     *
     * Maps to perp.js lines 558-571
     *
     * Math:
     * - newBaseReserve = baseReserve - baseSize
     * - newQuoteReserve = k / newBaseReserve
     * - quoteIn = newQuoteReserve - quoteReserve
     * - avgPrice = quoteIn / baseSize
     */
    function simulateCloseShort(uint256 baseSize)
        public
        view
        returns (uint256 quoteIn, uint256 avgPrice)
    {
        if (baseSize == 0) return (0, 0);
        if (baseSize >= baseReserve) revert InsufficientLiquidity();

        // Step 1: Remove base from reserves
        uint256 newBaseReserve = baseReserve - baseSize;

        // Step 2: Calculate new quote reserve using invariant with ceiling division
        // This ensures we round in favor of the pool (user pays more quoteIn)
        uint256 newQuoteReserve = (k + newBaseReserve - 1) / newBaseReserve;

        // Step 3: Quote in is the difference
        quoteIn = newQuoteReserve - quoteReserve;

        // Step 4: Average price = quoteIn / baseSize
        avgPrice = (quoteIn * PRECISION) / baseSize;
    }

    // ============ State-Modifying Functions (Engine Only) ============

    /**
     * @notice Execute an open long trade (updates reserves)
     * @param quoteIn Amount of quote tokens to spend
     * @return baseOut Amount of base tokens received
     * @return avgPrice Average execution price
     */
    function executeOpenLong(uint256 quoteIn)
        external
        onlyEngine
        returns (uint256 baseOut, uint256 avgPrice)
    {
        (baseOut, avgPrice) = simulateOpenLong(quoteIn);

        // Update reserves with ceiling division
        quoteReserve += quoteIn;
        baseReserve = (k + quoteReserve - 1) / quoteReserve;

        // Recalculate k to prevent rounding errors (matches perp.js line 841)
        k = baseReserve * quoteReserve;

        emit ReservesUpdated(baseReserve, quoteReserve, getMarkPrice());
    }

    /**
     * @notice Execute an open short trade (updates reserves)
     * @param quoteOut Desired notional value in quote tokens
     * @return baseIn Amount of base tokens required
     * @return avgPrice Average execution price
     */
    function executeOpenShort(uint256 quoteOut)
        external
        onlyEngine
        returns (uint256 baseIn, uint256 avgPrice)
    {
        (baseIn, avgPrice) = simulateOpenShort(quoteOut);

        // Update reserves with ceiling division
        quoteReserve -= quoteOut;
        baseReserve = (k + quoteReserve - 1) / quoteReserve;

        // Recalculate k to prevent rounding errors (matches perp.js line 1180)
        k = baseReserve * quoteReserve;

        emit ReservesUpdated(baseReserve, quoteReserve, getMarkPrice());
    }

    /**
     * @notice Execute a close long trade (updates reserves)
     * @param baseSize Amount of base tokens to sell
     * @return quoteOut Amount of quote tokens received
     * @return avgPrice Average execution price
     */
    function executeCloseLong(uint256 baseSize)
        external
        onlyEngine
        returns (uint256 quoteOut, uint256 avgPrice)
    {
        (quoteOut, avgPrice) = simulateCloseLong(baseSize);

        // Update reserves with ceiling division
        baseReserve += baseSize;
        quoteReserve = (k + baseReserve - 1) / baseReserve;

        // Recalculate k to prevent rounding errors (matches perp.js line 1285)
        k = baseReserve * quoteReserve;

        emit ReservesUpdated(baseReserve, quoteReserve, getMarkPrice());
    }

    /**
     * @notice Execute a close short trade (updates reserves)
     * @param baseSize Amount of base tokens to buy
     * @return quoteIn Amount of quote tokens required
     * @return avgPrice Average execution price
     */
    function executeCloseShort(uint256 baseSize)
        external
        onlyEngine
        returns (uint256 quoteIn, uint256 avgPrice)
    {
        (quoteIn, avgPrice) = simulateCloseShort(baseSize);

        // Update reserves with ceiling division
        baseReserve -= baseSize;
        quoteReserve = (k + baseReserve - 1) / baseReserve;

        // Recalculate k to prevent rounding errors (matches perp.js)
        k = baseReserve * quoteReserve;

        emit ReservesUpdated(baseReserve, quoteReserve, getMarkPrice());
    }

    /**
     * @notice Increase open interest for a side
     * @param isLong True for long, false for short
     * @param notional Notional value to add (18 decimals)
     */
    function increaseOpenInterest(bool isLong, uint256 notional) external onlyEngine {
        if (isLong) {
            longOpenInterest += notional;
        } else {
            shortOpenInterest += notional;
        }

        emit OpenInterestUpdated(longOpenInterest, shortOpenInterest);
    }

    /**
     * @notice Decrease open interest for a side
     * @param isLong True for long, false for short
     * @param notional Notional value to remove (18 decimals)
     */
    function decreaseOpenInterest(bool isLong, uint256 notional) external onlyEngine {
        if (isLong) {
            longOpenInterest -= notional;
        } else {
            shortOpenInterest -= notional;
        }

        emit OpenInterestUpdated(longOpenInterest, shortOpenInterest);
    }

    /**
     * @notice Advance block counter (for carry calculations)
     * @param numBlocks Number of blocks to advance
     */
    function advanceBlocks(uint256 numBlocks) external onlyEngine {
        unchecked {
            currentBlock += numBlocks;
        }
    }

    /**
     * @notice Update funding state (cumulative carry index and last funding block)
     * @dev Called by FundingManager after calculating new carry
     * @param newCarryIndex New cumulative carry index
     * @param newFundingBlock New last funding block
     */
    function updateFundingState(int256 newCarryIndex, uint256 newFundingBlock) external onlyEngine {
        cumulativeCarryIndex = newCarryIndex;
        lastFundingBlock = newFundingBlock;
    }
}
