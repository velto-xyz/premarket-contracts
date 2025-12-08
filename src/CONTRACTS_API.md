# Contracts API Reference

## MockUSDC
- `decimals() returns (uint8)` - Returns 6 decimals
- `mint(address to, uint256 amount)` - Mint tokens for testing
- `faucet()` - Get 10,000 USDC for testing

## LiquidationEngine
- `isLiquidatable(PositionManager, PerpMarket, uint256) returns (bool)` - Check if position liquidatable
- `getLiquidationInfo(PositionManager, PerpMarket, uint256) returns (bool isLiq, uint256 currentLoss, uint256 allowedLoss, int256 equity, uint256 leverage)` - Get liquidation details
- `calculateLiquidationFee(PositionManager, PerpMarket, uint256) returns (uint256)` - Calculate liquidation fee

## PerpMarket
- `setEngine(address)` - Set engine address (once)
- `getMarkPrice() returns (uint256)` - Current mark price from vAMM
- `simulateOpenLong(uint256 quoteIn) returns (uint256 baseOut, uint256 avgPrice)` - Simulate long open
- `simulateOpenShort(uint256 quoteOut) returns (uint256 baseIn, uint256 avgPrice)` - Simulate short open
- `simulateCloseLong(uint256 baseSize) returns (uint256 quoteOut, uint256 avgPrice)` - Simulate long close
- `simulateCloseShort(uint256 baseSize) returns (uint256 quoteIn, uint256 avgPrice)` - Simulate short close
- `executeOpenLong(uint256 quoteIn) returns (uint256 baseOut, uint256 avgPrice)` - Execute long open
- `executeOpenShort(uint256 quoteOut) returns (uint256 baseIn, uint256 avgPrice)` - Execute short open
- `executeCloseLong(uint256 baseSize) returns (uint256 quoteOut, uint256 avgPrice)` - Execute long close
- `executeCloseShort(uint256 baseSize) returns (uint256 quoteIn, uint256 avgPrice)` - Execute short close
- `increaseOpenInterest(bool isLong, uint256 notional)` - Increase OI for side
- `decreaseOpenInterest(bool isLong, uint256 notional)` - Decrease OI for side
- `advanceBlocks(uint256)` - Advance block counter
- `updateFundingState(int256 newCarryIndex, uint256 newFundingBlock)` - Update funding state

## PositionManager
- `setEngine(address)` - Set engine address (once)
- `createPosition(address user, bool isLong, uint256 baseSize, uint256 entryPrice, uint256 margin, int256 carrySnapshot) returns (uint256 positionId)` - Create position
- `updatePositionStatus(uint256 positionId, PositionStatus, int256 realizedPnl)` - Update position status
- `getLiquidationBufferRatio(uint256 leverage) returns (uint256)` - Get buffer ratio for leverage bucket
- `simulateEquityIfClosed(uint256) returns (uint256 closeNotional, uint256 avgClosePrice, int256 pnlTrade, int256 carryPnl, int256 totalPnl, int256 equityIfClosed)` - Calculate equity if closed now
- `getEffectiveOpenFeeRate() returns (uint256)` - Get OI-skewed fee rate
- `getPosition(uint256) returns (Position)` - Get position struct
- `isPositionOpen(uint256) returns (bool)` - Check if position open

## FundingManager
- `calculateUpdatedCarry(PerpMarket) returns (int256 newCarryIndex, int256 carryPerBlock)` - Calculate new carry index
- `getCurrentCarryIndex(PerpMarket) returns (int256)` - Get current carry index
- `calculateCarryPnl(PerpMarket, bool isLong, uint256 notional, int256 carrySnapshot) returns (int256)` - Calculate carry PnL

## PerpEngine
- `deposit(uint256 amount)` - Deposit USDC (6 decimals) to wallet
- `withdraw(uint256 amount)` - Withdraw from wallet (18 decimals internal)
- `openPosition(bool isLong, uint256 totalToUse, uint256 leverage) returns (uint256 positionId)` - Open leveraged position (Mode 3)
- `closePosition(uint256 positionId) returns (int256 totalPnl)` - Close position
- `liquidate(uint256 positionId)` - Liquidate underwater position
- `getWalletBalance(address) returns (uint256)` - Get user wallet balance
- `getFundBalances() returns (uint256 trade, uint256 insurance, uint256 protocol)` - Get fund balances

## PerpFactory

### Access Control
Inherits from OpenZeppelin's `Ownable`. Market creation is restricted to authorized addresses.

### State Variables
- `owner() returns (address)` - Current factory owner (from Ownable)
- `isMarketCreator(address) returns (bool)` - Check if address can create markets
- `liquidationEngine() returns (address)` - Shared liquidation engine for all markets
- `fundingManager() returns (address)` - Shared funding manager for all markets
- `markets(uint256) returns (address)` - Get market by index
- `isEngine(address) returns (bool)` - Check if address is a deployed engine

### Owner Functions
- `setMarketCreator(address creator, bool authorized)` - Authorize/revoke market creation rights (owner only)
- `transferOwnership(address newOwner)` - Transfer ownership (owner only, from Ownable)
- `renounceOwnership()` - Renounce ownership (owner only, from Ownable)

### Market Creator Functions
- `createMarket(address collateralToken, MarketConfig) returns (address engineAddress)` - Deploy new market (requires owner or authorized market creator)

### Public View Functions
- `getMarketCount() returns (uint256)` - Total deployed markets
- `getMarket(uint256 index) returns (address)` - Get engine by index
- `getAllMarkets() returns (address[])` - Get all engine addresses

### Events
- `MarketCreated(uint256 indexed marketIndex, address indexed engine, address market, address collateralToken)` - Emitted when market created
- `MarketCreatorUpdated(address indexed creator, bool authorized)` - Emitted when creator authorization changes
- `OwnershipTransferred(address indexed previousOwner, address indexed newOwner)` - Emitted when ownership transfers (from Ownable)

### Errors
- `Unauthorized()` - Caller not authorized to create markets
- `InvalidReserves()` - Reserve parameters invalid (zero values)
- `InvalidLeverage()` - Leverage parameter invalid (zero or >30x)
