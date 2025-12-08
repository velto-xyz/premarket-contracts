# TypeScript Contract API Reference

Token-optimized reference for LLM consumption. Mirrors CONTRACTS_API.md structure.

## Usage

```ts
const service = new ContractService(publicClient, walletClient?);
// Or via hook: const service = useContractService();

// Access grouped by contract
await service.usdc.faucet();
await service.engine.openPosition(addr, true, amount, 10n);
await service.helpers.approveAndDeposit(addr, amount);
```

## Types

```ts
Position { id, user, isLong, baseSize, entryPrice, entryNotional, margin, carrySnapshot, openBlock, status, realizedPnl }
MarketData { marketAddress, baseReserve, quoteReserve, markPrice, longOI, shortOI, netOI, carryIndex, currentBlock, lastFundingBlock, tradeFund, insuranceFund, protocolFees, timestamp }
MarketConfig { baseReserve, quoteReserve, maxLeverage }
LiquidationInfo { isLiquidatable, currentLoss, allowedLoss, equity, leverage }
PositionEquity { closeNotional, avgClosePrice, pnlTrade, carryPnl, totalPnl, equityIfClosed }
```

## MockUSDCService

- `decimals(): Promise<number>` - Get USDC decimals (6)
- `balanceOf(address): Promise<bigint>` - Get USDC balance
- `mint(to, amount): Promise<{txHash}>` - Mint USDC (testing)
- `faucet(): Promise<{txHash}>` - Get 10k USDC from faucet
- `approve(spender, amount): Promise<{txHash}>` - Approve USDC spending

## LiquidationEngineService

- `isLiquidatable(positionMgr, market, positionId): Promise<boolean>` - Check if liquidatable
- `getLiquidationInfo(positionMgr, market, positionId): Promise<LiquidationInfo>` - Get liquidation details
- `calculateLiquidationFee(positionMgr, market, positionId): Promise<bigint>` - Calculate liq fee

## PerpMarketService

- `getMarkPrice(market): Promise<bigint>` - Current mark price
- `simulateOpenLong(market, quoteIn): Promise<{baseOut, avgPrice}>` - Simulate long open
- `simulateOpenShort(market, quoteOut): Promise<{baseIn, avgPrice}>` - Simulate short open
- `simulateCloseLong(market, baseSize): Promise<{quoteOut, avgPrice}>` - Simulate long close
- `simulateCloseShort(market, baseSize): Promise<{quoteIn, avgPrice}>` - Simulate short close
- `getReserves(market): Promise<{baseReserve, quoteReserve, k}>` - Get vAMM reserves
- `getOpenInterest(market): Promise<{longOI, shortOI}>` - Get OI for both sides
- `getFundingState(market): Promise<{carryIndex, lastFundingBlock, currentBlock}>` - Get funding state

## PositionManagerService

- `getPosition(positionMgr, positionId): Promise<Position>` - Get position details
- `isPositionOpen(positionMgr, positionId): Promise<boolean>` - Check if position open
- `simulateEquityIfClosed(positionMgr, positionId): Promise<PositionEquity>` - Calculate equity if closed
- `getEffectiveOpenFeeRate(positionMgr): Promise<bigint>` - Get OI-skewed fee rate
- `getLiquidationBufferRatio(positionMgr, leverage): Promise<bigint>` - Get buffer ratio for leverage

## FundingManagerService

- `calculateUpdatedCarry(fundingMgr, market): Promise<{newCarryIndex, carryPerBlock}>` - Calculate new carry
- `getCurrentCarryIndex(fundingMgr, market): Promise<bigint>` - Get current carry index
- `calculateCarryPnl(fundingMgr, market, isLong, notional, carrySnapshot): Promise<bigint>` - Calculate carry PnL

## PerpEngineService

- `deposit(engine, amount): Promise<{txHash}>` - Deposit USDC (6 decimals)
- `withdraw(engine, amount): Promise<{txHash}>` - Withdraw from wallet (18 decimals internal)
- `openPosition(engine, isLong, totalToUse, leverage): Promise<{txHash, positionId?}>` - Open leveraged position
- `closePosition(engine, positionId): Promise<{txHash, totalPnl?}>` - Close position
- `liquidate(engine, positionId): Promise<{txHash}>` - Liquidate underwater position
- `getWalletBalance(engine, user): Promise<bigint>` - Get user wallet balance
- `getFundBalances(engine): Promise<{trade, insurance, protocol}>` - Get fund balances
- `getMarketAddress(engine): Promise<Address>` - Get market address from engine
- `getPositionManagerAddress(engine): Promise<Address>` - Get position manager address
- `getFullMarketData(engine): Promise<MarketData>` - Get aggregated market data (single call)

## PerpFactoryService

### Access Control
- `owner(): Promise<Address>` - Get current factory owner
- `isMarketCreator(address): Promise<boolean>` - Check if address can create markets
- `setMarketCreator(creator, authorized): Promise<{txHash}>` - Authorize/revoke market creation rights (owner only)
- `transferOwnership(newOwner): Promise<{txHash}>` - Transfer ownership (owner only)

### Market Management
- `createMarket(collateral, baseReserve, quoteReserve, maxLeverage): Promise<{txHash, engineAddress?}>` - Deploy new market (requires owner or authorized market creator)
- `getMarketCount(): Promise<bigint>` - Total deployed markets
- `getMarket(index): Promise<Address>` - Get engine by index
- `getAllMarkets(): Promise<Address[]>` - Get all engine addresses
- `isEngine(address): Promise<boolean>` - Check if address is a deployed engine

### State Variables
- `liquidationEngine(): Promise<Address>` - Get shared liquidation engine address
- `fundingManager(): Promise<Address>` - Get shared funding manager address

## HelperService

High-level workflows combining multiple operations:

- `approveAndDeposit(engine, amount): Promise<{txHash}>` - Approve + deposit in one call
- `fundBot(engine): Promise<{txHash, balance}>` - Faucet + approve + deposit for testing
- `getPositionAnalytics(engine, positionId): Promise<{position, equity, liquidationInfo, isOpen}>` - Comprehensive position data

## Error Handling

All methods throw on error with decoded revert messages:
```ts
try {
  await service.engine.openPosition(...);
} catch (error) {
  // Error includes decoded contract error name and args
  console.error(error.message); // "Contract Error: InsufficientBalance"
}
```

### Common Errors
- `Unauthorized()` - Caller not authorized (PerpFactory market creation)
- `InsufficientBalance()` - Not enough balance for operation
- `InvalidReserves()` - Invalid reserve parameters (PerpFactory)
- `InvalidLeverage()` - Invalid leverage parameter (PerpFactory: 0 or >30x)
- `PositionNotOpen()` - Position not open or doesn't exist
- `PositionNotLiquidatable()` - Position health above liquidation threshold

## Notes

- All amounts in bigint (18 decimals internal, 6 for USDC)
- Wallet client optional for read-only operations
- Event parsing extracts positionId, totalPnl, engineAddress from receipts
- Parallel reads used where possible (Promise.all)
