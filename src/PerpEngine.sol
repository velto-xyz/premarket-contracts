// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Initializable} from "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import {PerpMarket} from "./PerpMarket.sol";
import {PositionManager} from "./PositionManager.sol";
import {FundingManager} from "./FundingManager.sol";
import {LiquidationEngine} from "./LiquidationEngine.sol";

/**
 * @title PerpEngine
 * @notice Main orchestrator for perpetual futures trading
 * @dev Supports both standalone and permit-based workflows
 *
 * This is the main user-facing contract. It:
 * - Manages user wallets and protocol funds
 * - Coordinates with all other contracts
 * - Implements depositWithPermit (EIP-2612 gasless approval)
 * - Implements depositAndOpenPosition (gasless one-transaction open)
 * - Implements standalone withdraw() and closePosition()
 * - Implements liquidation
 */
contract PerpEngine is ReentrancyGuard, Initializable {
    using SafeERC20 for IERC20;

    // ============ Constants ============

    uint256 public constant PRECISION = 1e18;
    uint256 public constant MAX_LEVERAGE = 30 * PRECISION; // 30x max

    /// @notice USDC has 6 decimals, we use 18 internally
    uint256 public constant USDC_TO_INTERNAL = 1e12;

    // ============ State Variables ============

    /// @notice Collateral token (USDC)
    IERC20 public collateralToken;

    /// @notice Reference contracts
    PerpMarket public market;
    PositionManager public positionManager;
    FundingManager public fundingManager;
    LiquidationEngine public liquidationEngine;

    /// @notice Block number when this market was deployed
    uint256 public deploymentBlock;

    /// @notice User wallet balances (18 decimals)
    mapping(address => uint256) public userWallets;

    /// @notice Trade fund (holds all active margin, 18 decimals)
    uint256 public tradeFund;

    /// @notice Insurance fund (bad debt coverage, 18 decimals)
    uint256 public insuranceFund;

    /// @notice Protocol fees collected (18 decimals)
    uint256 public protocolFees;

    // ============ Events ============

    event Deposit(address indexed user, uint256 amount);
    event Withdraw(address indexed user, uint256 amount);

    event PositionOpened(
        uint256 indexed positionId,
        address indexed user,
        bool indexed isLong,
        uint256 totalToUse,
        uint256 margin,
        uint256 fee,
        uint256 leverage,
        uint256 baseSize,
        uint256 entryPrice
    );

    event PositionClosed(
        uint256 indexed positionId,
        address indexed user,
        int256 totalPnl,
        uint256 avgClosePrice
    );

    event PositionLiquidated(
        uint256 indexed positionId,
        address indexed user,
        address indexed liquidator,
        uint256 liqFee
    );

    // ============ Errors ============

    error InsufficientBalance();
    error InvalidLeverage();
    error InvalidAmount();
    error PositionNotFound();
    error NotPositionOwner();
    error NotLiquidatable();

    // ============ Initialization ============

    /**
     * @notice Initialize the engine (replaces constructor for clone pattern)
     * @param _collateralToken Address of collateral token (USDC)
     * @param _market PerpMarket address
     * @param _positionManager PositionManager address
     * @param _fundingManager FundingManager address
     * @param _liquidationEngine LiquidationEngine address
     */
    function initialize(
        address _collateralToken,
        PerpMarket _market,
        PositionManager _positionManager,
        FundingManager _fundingManager,
        LiquidationEngine _liquidationEngine
    ) external initializer {
        collateralToken = IERC20(_collateralToken);
        market = _market;
        positionManager = _positionManager;
        fundingManager = _fundingManager;
        liquidationEngine = _liquidationEngine;
        deploymentBlock = block.number;
    }

    // ============ Deposit / Withdraw ============

    /**
     * @notice Deposit USDC into user wallet (requires prior approval)
     * @param amount Amount of USDC to deposit (6 decimals)
     */
    function deposit(uint256 amount) external nonReentrant {
        if (amount == 0) revert InvalidAmount();

        // Transfer USDC from user
        collateralToken.safeTransferFrom(msg.sender, address(this), amount);

        // Convert to internal 18 decimals
        uint256 internalAmount = amount * USDC_TO_INTERNAL;
        userWallets[msg.sender] += internalAmount;

        emit Deposit(msg.sender, internalAmount);
    }

    /**
     * @notice Deposit USDC into user wallet using EIP-2612 permit (gasless approval)
     * @param depositAmount Amount of USDC to deposit (6 decimals)
     * @param permitAmount Amount approved in permit signature (6 decimals, can be larger/unlimited)
     * @param deadline Permit deadline timestamp
     * @param v Permit signature v
     * @param r Permit signature r
     * @param s Permit signature s
     */
    function depositWithPermit(
        uint256 depositAmount,
        uint256 permitAmount,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external nonReentrant {
        if (depositAmount == 0) revert InvalidAmount();

        // Execute permit (gasless approval) for permitAmount
        // permitAmount can be larger (e.g., type(uint256).max for unlimited) to reuse signature
        IERC20Permit(address(collateralToken)).permit(
            msg.sender,
            address(this),
            permitAmount,
            deadline,
            v,
            r,
            s
        );

        // Transfer actual deposit amount from user
        collateralToken.safeTransferFrom(msg.sender, address(this), depositAmount);

        // Convert to internal 18 decimals
        uint256 internalAmount = depositAmount * USDC_TO_INTERNAL;
        userWallets[msg.sender] += internalAmount;

        emit Deposit(msg.sender, internalAmount);
    }

    /**
     * @notice Withdraw USDC from user wallet
     * @param amount Amount to withdraw (18 decimals internal)
     */
    function withdraw(uint256 amount) external nonReentrant {
        if (amount == 0) revert InvalidAmount();
        if (userWallets[msg.sender] < amount) revert InsufficientBalance();

        // Deduct from wallet
        userWallets[msg.sender] -= amount;

        // Convert to USDC 6 decimals
        uint256 usdcAmount = amount / USDC_TO_INTERNAL;

        // Transfer USDC to user
        collateralToken.safeTransfer(msg.sender, usdcAmount);

        emit Withdraw(msg.sender, amount);
    }

    // ============ Open Position ============

    /**
     * @notice Open a leveraged position (Mode 3)
     * @dev Maps to perp.js lines 743-883
     *
     * Mode 3 Algorithm:
     * 1. Get effective fee rate (OI-skewed)
     * 2. Calculate margin: margin = totalToUse / (1 + leverage * feeRate)
     * 3. Calculate notional: notional = margin * leverage
     * 4. Calculate fee: fee = notional * feeRate
     * 5. Verify: margin + fee ≈ totalToUse
     * 6. Deduct totalToUse from user wallet
     * 7. Add margin to tradeFund
     * 8. Split fee: 50% insurance, 50% protocol
     * 9. Execute vAMM trade
     * 10. Create position
     * 11. Update OI
     *
     * @param isLong True for long, false for short
     * @param totalToUse Total amount to use from wallet (18 decimals)
     * @param leverage Desired leverage (18 decimals, e.g., 10e18 = 10x)
     * @return positionId The created position ID
     */
    function openPosition(
        bool isLong,
        uint256 totalToUse,
        uint256 leverage
    ) external nonReentrant returns (uint256 positionId) {
        return _openPosition(isLong, totalToUse, leverage);
    }

    /**
     * @dev Internal function to open position (called by openPosition and depositAndOpenPosition)
     */
    function _openPosition(
        bool isLong,
        uint256 totalToUse,
        uint256 leverage
    ) internal returns (uint256 positionId) {
        // Validations
        if (totalToUse == 0) revert InvalidAmount();
        if (leverage == 0 || leverage > MAX_LEVERAGE) revert InvalidLeverage();
        if (userWallets[msg.sender] < totalToUse) revert InsufficientBalance();

        // Step 1: Get effective fee rate (perp.js line 756)
        uint256 feeRate = positionManager.getEffectiveOpenFeeRate();

        // Step 2-4: Mode 3 math (perp.js lines 769-771)
        // margin = totalToUse / (1 + leverage * feeRate)
        uint256 denominator = PRECISION + (leverage * feeRate) / PRECISION;
        uint256 margin = (totalToUse * PRECISION) / denominator;
        uint256 notional = (margin * leverage) / PRECISION;
        uint256 fee = (notional * feeRate) / PRECISION;

        // Step 6-8: Funds movement (perp.js lines 795-801)
        userWallets[msg.sender] -= totalToUse;
        tradeFund += margin;

        uint256 halfFee = fee / 2;
        insuranceFund += halfFee;
        protocolFees += (fee - halfFee); // Handle odd fees

        // Step 9: Execute vAMM trade (perp.js lines 824-836)
        uint256 baseSize;
        uint256 entryPrice;

        if (isLong) {
            (baseSize, entryPrice) = market.executeOpenLong(notional);
        } else {
            (baseSize, entryPrice) = market.executeOpenShort(notional);
        }

        // Update carry before creating position
        (int256 newCarryIndex,) = fundingManager.calculateUpdatedCarry(market);
        market.updateFundingState(newCarryIndex, market.currentBlock());

        // Step 10: Create position (perp.js lines 851-863)
        int256 carrySnapshot = market.cumulativeCarryIndex();
        positionId = positionManager.createPosition(
            msg.sender,
            isLong,
            baseSize,
            entryPrice,
            margin,
            carrySnapshot
        );

        // Step 11: Update OI (perp.js line 866)
        uint256 entryNotional = (baseSize * entryPrice) / PRECISION;
        market.increaseOpenInterest(isLong, entryNotional);

        emit PositionOpened(
            positionId,
            msg.sender,
            isLong,
            totalToUse,
            margin,
            fee,
            leverage,
            baseSize,
            entryPrice
        );
    }

    // ============ Close Position ============

    /**
     * @notice Close a position
     * @param positionId Position ID to close
     * @return totalPnl Total PnL (trading + carry)
     */
    function closePosition(uint256 positionId)
        external
        nonReentrant
        returns (int256 totalPnl)
    {
        PositionManager.Position memory position = positionManager.getPosition(positionId);

        // Verify ownership
        if (position.user != msg.sender) revert NotPositionOwner();
        if (!positionManager.isPositionOpen(positionId)) revert PositionNotFound();

        // Update carry
        (int256 newCarryIndex,) = fundingManager.calculateUpdatedCarry(market);
        market.updateFundingState(newCarryIndex, market.currentBlock());

        // Execute vAMM close
        uint256 closeNotional;
        uint256 avgClosePrice;

        if (position.isLong) {
            (closeNotional, avgClosePrice) = market.executeCloseLong(position.baseSize);
        } else {
            (closeNotional, avgClosePrice) = market.executeCloseShort(position.baseSize);
        }

        // Calculate PnL
        int256 pnlTrade;
        if (position.isLong) {
            pnlTrade = int256(closeNotional) - int256(position.entryNotional);
        } else {
            pnlTrade = int256(position.entryNotional) - int256(closeNotional);
        }

        // Calculate carry PnL
        uint256 markPrice = market.getMarkPrice();
        uint256 notionalNow = (position.baseSize * markPrice) / PRECISION;
        int256 deltaCarry = market.cumulativeCarryIndex() - position.carrySnapshot;
        int256 sideSign = position.isLong ? int256(-1) : int256(1);
        uint256 absCarry = deltaCarry >= 0 ? uint256(deltaCarry) : uint256(-deltaCarry);
        uint256 carryMagnitude = (notionalNow * absCarry) / PRECISION;
        int256 carryPnl = int256(carryMagnitude) * sideSign * (deltaCarry >= 0 ? int256(1) : int256(-1));

        totalPnl = pnlTrade + carryPnl;

        // Calculate payout
        int256 payout = int256(position.margin) + totalPnl;

        // Update funds
        tradeFund -= position.margin;

        if (payout > 0) {
            userWallets[msg.sender] += uint256(payout);
        }

        // Decrease OI
        market.decreaseOpenInterest(position.isLong, position.entryNotional);

        // Update position
        positionManager.updatePositionStatus(
            positionId,
            PositionManager.PositionStatus.CLOSED,
            totalPnl
        );

        emit PositionClosed(positionId, msg.sender, totalPnl, avgClosePrice);
    }

    // ============ Liquidation ============

    /**
     * @notice Liquidate an underwater position
     * @dev Maps to perp.js lines 1253-1339
     *
     * Algorithm:
     * 1. Check if position is liquidatable
     * 2. Update carry
     * 3. Execute vAMM close
     * 4. Calculate PnL and equity
     * 5. Calculate liquidation fee
     * 6. Pay liquidator
     * 7. Handle remaining equity or bad debt
     * 8. Decrease OI
     * 9. Update position status
     *
     * @param positionId Position ID to liquidate
     */
    function liquidate(uint256 positionId) external nonReentrant {
        // Check if liquidatable
        if (!liquidationEngine.isLiquidatable(positionManager, market, positionId)) revert NotLiquidatable();

        PositionManager.Position memory position = positionManager.getPosition(positionId);

        // Update carry
        (int256 newCarryIndex,) = fundingManager.calculateUpdatedCarry(market);
        market.updateFundingState(newCarryIndex, market.currentBlock());

        // Execute vAMM close
        uint256 closeNotional;
        if (position.isLong) {
            (closeNotional,) = market.executeCloseLong(position.baseSize);
        } else {
            (closeNotional,) = market.executeCloseShort(position.baseSize);
        }

        // Calculate PnL (same as closePosition)
        int256 pnlTrade;
        if (position.isLong) {
            pnlTrade = int256(closeNotional) - int256(position.entryNotional);
        } else {
            pnlTrade = int256(position.entryNotional) - int256(closeNotional);
        }

        uint256 markPrice = market.getMarkPrice();
        uint256 notionalNow = (position.baseSize * markPrice) / PRECISION;
        int256 deltaCarry = market.cumulativeCarryIndex() - position.carrySnapshot;
        int256 sideSign = position.isLong ? int256(-1) : int256(1);
        // Safe carry calculation to prevent overflow
        uint256 absCarry = deltaCarry >= 0 ? uint256(deltaCarry) : uint256(-deltaCarry);
        uint256 carryMagnitude = (notionalNow * absCarry) / PRECISION;
        int256 carryPnl = int256(carryMagnitude) * sideSign * (deltaCarry >= 0 ? int256(1) : int256(-1));

        int256 totalPnl = pnlTrade + carryPnl;
        int256 equity = int256(position.margin) + totalPnl;

        // Calculate liquidation fee
        uint256 liqFee = (closeNotional * liquidationEngine.LIQUIDATION_FEE_RATIO()) / PRECISION;

        // Remove margin from tradeFund
        tradeFund -= position.margin;

        // Handle equity and liquidation fee
        if (equity > int256(liqFee)) {
            // Positive equity after fee: pay liquidator, return rest to user
            uint256 toUser = uint256(equity) - liqFee;
            userWallets[position.user] += toUser;
            userWallets[msg.sender] += liqFee;
        } else if (equity > 0) {
            // Positive equity but less than fee: give all to liquidator
            userWallets[msg.sender] += uint256(equity);
        } else {
            // Negative equity (bad debt): cover from insurance fund
            uint256 badDebt = uint256(-equity);
            if (insuranceFund >= badDebt + liqFee) {
                insuranceFund -= (badDebt + liqFee);
                userWallets[msg.sender] += liqFee;
            } else {
                // Insurance fund insufficient - give what we have
                if (insuranceFund > 0) {
                    userWallets[msg.sender] += insuranceFund;
                    insuranceFund = 0;
                }
                // Remaining bad debt would be socialized (not implemented in MVP)
            }
        }

        // Decrease OI
        market.decreaseOpenInterest(position.isLong, position.entryNotional);

        // Update position
        positionManager.updatePositionStatus(
            positionId,
            PositionManager.PositionStatus.LIQUIDATED,
            totalPnl
        );

        emit PositionLiquidated(positionId, position.user, msg.sender, liqFee);
    }

    // ============ Permit-Based Convenience Functions ============

    /**
     * @notice Deposit USDC using permit and open position in one transaction
     * @dev Uses EIP-2612 permit for gasless approval. Perfect for new users.
     * @param depositAmount Amount of USDC to deposit (6 decimals)
     * @param permitAmount Amount approved in permit signature (6 decimals, can be larger/unlimited)
     * @param isLong True for long, false for short
     * @param totalToUse Total amount to use from wallet (18 decimals)
     * @param leverage Desired leverage (18 decimals, e.g., 10e18 = 10x)
     * @param deadline Permit deadline timestamp
     * @param v Permit signature v
     * @param r Permit signature r
     * @param s Permit signature s
     * @return positionId The created position ID
     */
    function depositAndOpenPositionWithPermit(
        uint256 depositAmount,
        uint256 permitAmount,
        bool isLong,
        uint256 totalToUse,
        uint256 leverage,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external nonReentrant returns (uint256 positionId) {
        // 1. Execute permit (gasless approval) for permitAmount
        // permitAmount can be larger (e.g., type(uint256).max for unlimited) to reuse signature
        IERC20Permit(address(collateralToken)).permit(
            msg.sender,
            address(this),
            permitAmount,
            deadline,
            v,
            r,
            s
        );

        // 2. Deposit actual deposit amount
        if (depositAmount == 0) revert InvalidAmount();
        collateralToken.safeTransferFrom(msg.sender, address(this), depositAmount);
        uint256 internalAmount = depositAmount * USDC_TO_INTERNAL;
        userWallets[msg.sender] += internalAmount;
        emit Deposit(msg.sender, internalAmount);

        // 3. Open position (calls internal _openPosition to avoid reentrancy guard collision)
        return _openPosition(isLong, totalToUse, leverage);
    }

    // ============ Convenience Functions (Requires Prior Approval) ============

    /**
     * @notice Deposit USDC and open position in one transaction (assumes approval already set)
     * @dev Use this when you've already called permit() or approve() separately
     * @param depositAmount Amount of USDC to deposit (6 decimals)
     * @param isLong True for long, false for short
     * @param totalToUse Total amount to use from wallet (18 decimals)
     * @param leverage Desired leverage (18 decimals, e.g., 10e18 = 10x)
     * @return positionId The created position ID
     */
    function depositAndOpenPosition(
        uint256 depositAmount,
        bool isLong,
        uint256 totalToUse,
        uint256 leverage
    ) external nonReentrant returns (uint256 positionId) {
        // 1. Deposit USDC (requires prior approval)
        if (depositAmount == 0) revert InvalidAmount();
        collateralToken.safeTransferFrom(msg.sender, address(this), depositAmount);
        uint256 internalAmount = depositAmount * USDC_TO_INTERNAL;
        userWallets[msg.sender] += internalAmount;
        emit Deposit(msg.sender, internalAmount);

        // 2. Open position (calls internal _openPosition to avoid reentrancy guard collision)
        return _openPosition(isLong, totalToUse, leverage);
    }

    // ============ View Functions ============

    /**
     * @notice Get user's wallet balance
     * @param user User address
     * @return balance User's wallet balance (18 decimals)
     */
    function getWalletBalance(address user) external view returns (uint256) {
        return userWallets[user];
    }

    /**
     * @notice Get all fund balances
     * @return trade Trade fund balance
     * @return insurance Insurance fund balance
     * @return protocol Protocol fees balance
     */
    function getFundBalances()
        external
        view
        returns (
            uint256 trade,
            uint256 insurance,
            uint256 protocol
        )
    {
        return (tradeFund, insuranceFund, protocolFees);
    }

    /**
     * @notice Get market deployment info for indexing
     * @return perpEngine Address of this PerpEngine
     * @return perpMarket Address of PerpMarket
     * @return positionMgr Address of PositionManager
     * @return chainId Current chain ID
     * @return deployBlock Block number when deployed
     */
    function getMarketInfo()
        external
        view
        returns (
            address perpEngine,
            address perpMarket,
            address positionMgr,
            uint256 chainId,
            uint256 deployBlock
        )
    {
        return (
            address(this),
            address(market),
            address(positionManager),
            block.chainid,
            deploymentBlock
        );
    }
}
