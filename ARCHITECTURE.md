# Perp DEX Production Architecture

## System Overview
vAMM-based perpetual futures with OI-driven funding. No oracle dependency. Pure price discovery via constant product AMM.

## Core State Model

### Market State
```
baseReserve: decimal          # Virtual AMM base asset
quoteReserve: decimal         # Virtual AMM quote asset
k: decimal                    # Invariant (baseReserve * quoteReserve)
longOpenInterest: decimal     # Sum of long position notionals
shortOpenInterest: decimal    # Sum of short position notionals
cumulativeCarryIndex: decimal # Funding accumulator
currentBlock: integer         # Time/block counter
lastFundingBlock: integer     # Last funding update
```

### Position State
```
id: identifier
userId: identifier
isLong: boolean
baseSize: decimal             # Position size in base asset
entryPrice: decimal           # Average entry price
entryNotional: decimal        # baseSize * entryPrice
margin: decimal               # Locked collateral
carrySnapshot: decimal        # Carry index at open
openBlock: integer
status: enum(OPEN, CLOSED, LIQUIDATED)
realizedPnl: decimal
```

### Funds State
```
userWallets: map[userId → decimal]     # Free collateral per user
tradeFund: decimal                      # Pool holding all active margin
insuranceFund: decimal                  # Backstop for bad debt
protocolFees: decimal                   # Accumulated protocol revenue
```

## Critical Algorithms

### 1. vAMM Math (Constant Product)

**Open Long** (buy base with quote):
```
Input: quoteIn
newQuoteReserve = quoteReserve + quoteIn
newBaseReserve = k / newQuoteReserve
baseOut = baseReserve - newBaseReserve
avgPrice = quoteIn / baseOut
```

**Open Short** (sell base for quote):
```
Input: quoteOut (desired notional)
newQuoteReserve = quoteReserve - quoteOut
newBaseReserve = k / newQuoteReserve
baseIn = newBaseReserve - baseReserve
avgPrice = quoteOut / baseIn
```

**Close Long** (sell base for quote):
```
Input: baseSize
newBaseReserve = baseReserve + baseSize
newQuoteReserve = k / newBaseReserve
quoteOut = quoteReserve - newQuoteReserve
avgPrice = quoteOut / baseSize
```

**Close Short** (buy base with quote):
```
Input: baseSize
newBaseReserve = baseReserve - baseSize
newQuoteReserve = k / newBaseReserve
quoteIn = newQuoteReserve - quoteReserve
avgPrice = quoteIn / baseSize
```

### 2. Funding (Carry) Accrual

**Per Block/Tick**:
```
totalOI = longOpenInterest + shortOpenInterest
if totalOI == 0: return

imbalance = longOpenInterest - shortOpenInterest
imbalanceRatio = imbalance / totalOI  # Range: [-1, 1]

carryPerBlock = BASE_CARRY_RATE * CARRY_SENSITIVITY * imbalanceRatio
cumulativeCarryIndex += carryPerBlock
```

**Position Carry PnL**:
```
deltaCarry = currentCarryIndex - position.carrySnapshot
notionalNow = position.baseSize * markPrice
sideSign = position.isLong ? -1 : +1  # Longs pay when index rises
carryPnl = sideSign * notionalNow * deltaCarry
```

### 3. Position Opening (Mode 3)

**Inputs**: `totalToUse` (wallet deduction), `leverage` (desired)

**Solve**:
```
feeRate = BASE_FEE_RATE * (1 + |imbalanceRatio| * OI_SKEW_MULTIPLIER)

margin = totalToUse / (1 + leverage * feeRate)
notional = margin * leverage
fee = notional * feeRate

# Verify: margin + fee ≈ totalToUse
```

**Execute**:
1. Deduct `totalToUse` from userWallet
2. Add `margin` to tradeFund
3. Split `fee` → insuranceFund + protocolFees
4. Execute vAMM trade with `notional` → get `baseSize`, `entryPrice`
5. Create position record, increase OI by `entryNotional`

### 4. Liquidation Logic

**Health Check**:
```
# Simulate closing position now
equity = simulateCloseAndGetEquity(position)

# Current leverage
notionalNow = position.baseSize * markPrice
leverage = notionalNow / position.margin

# Dynamic buffer based on leverage
if leverage <= 10: bufferRatio = 0.10
elif leverage <= 20: bufferRatio = 0.20
else: bufferRatio = 0.30

# Liquidation condition
currentLoss = max(0, margin - equity)
allowedLoss = margin * (1 - bufferRatio)

isLiquidatable = (currentLoss > allowedLoss)
```

**Execute Liquidation**:
1. Close position on vAMM → get `closeNotional`, `pnlTrade`, `carryPnl`
2. Compute `equity = margin + pnlTrade + carryPnl`
3. Compute `liqFee = closeNotional * LIQUIDATION_FEE_RATIO`
4. If `equity >= 0`: pay `(equity - liqFee)` to user, `liqFee` to liquidator
5. If `equity < 0`: cover `(-equity + liqFee)` from insuranceFund/tradeFund

### 5. Equity Simulation (for health checks)

```
# Close on vAMM (read-only)
if position.isLong:
  closeNotional = simulateCloseLong(position.baseSize).quoteOut
else:
  closeNotional = simulateCloseShort(position.baseSize).quoteIn

# Trading PnL
if position.isLong:
  pnlTrade = closeNotional - position.entryNotional
else:
  pnlTrade = position.entryNotional - closeNotional

# Carry PnL
deltaCarry = cumulativeCarryIndex - position.carrySnapshot
notionalNow = position.baseSize * markPrice
sideSign = position.isLong ? -1 : +1
carryPnl = sideSign * notionalNow * deltaCarry

# Total
totalPnl = pnlTrade + carryPnl
equity = position.margin + totalPnl
```

## System Components (Platform-Agnostic)

### Settlement Layer
**Responsibility**: State persistence, transaction finality
- Store market state, positions, funds
- Atomic state updates (position open/close/liquidate)
- Event emission for state changes
- Access control (user signatures, liquidator privileges)

**Critical Properties**:
- Reentrancy protection on fund transfers
- Precision handling (fixed-point arithmetic, min 18 decimals)
- Same-block liquidation protection (openBlock != currentBlock)

### Indexing Layer
**Responsibility**: Real-time position monitoring
- Subscribe to settlement layer events (PositionOpened, CarryUpdated, etc.)
- Maintain queryable position database with computed health metrics
- Track mark price history, OI snapshots per block

**Data Requirements**:
```
positions:
  - All fields from Position State
  - Computed: currentLeverage, bufferRatio, equityIfClosed, isLiquidatable

market_snapshots:
  - Per-block: markPrice, longOI, shortOI, carryIndex
```

### Liquidation Execution Layer
**Responsibility**: Automated position closure
- Poll/subscribe to liquidatable positions from indexer
- Submit liquidation transactions to settlement layer
- Profit optimization: filter by (liqFee > executionCost)
- Concurrency handling for competitive liquidations

**Logic Flow**:
```
1. Scan positions where isLiquidatable == true
2. For each: verify liquidation profitability
3. Submit transaction: liquidatePosition(positionId, liquidatorAddress)
4. On success: collect liquidation fee
```

### User Interface Layer
**Responsibility**: User interactions, position management
- Read: GET position health, market price, OI, fee rates
- Write: Open position (totalToUse, leverage, side), close position
- Real-time: Subscribe to price feed, position PnL updates

**Key API Patterns**:
```
# Read
getMarketState() → {markPrice, longOI, shortOI, carryIndex}
getPositionHealth(positionId) → {equity, leverage, bufferRatio, pnlBreakdown}
getEffectiveFeeRate() → decimal (for margin calculation preview)

# Write
openPosition(userId, totalToUse, leverage, isLong) → positionId
closePosition(positionId) → {pnl, avgClosePrice}

# Stream
subscribePrice() → stream<markPrice>
subscribePositionPnl(positionId) → stream<{equity, pnl}>
```

## Configuration Parameters

```
INITIAL_BASE_RESERVE: 100000
INITIAL_QUOTE_RESERVE: 100000
MAX_LEVERAGE: 30

BASE_OPEN_FEE_RATE: 0.001           # 0.1% of notional
OI_SKEW_FEE_MULTIPLIER: 1.0         # Linear skew adjustment
LIQUIDATION_FEE_RATIO: 0.005        # 0.5% to liquidator

BASE_CARRY_RATE_PER_BLOCK: 0.0001   # 0.01% per block
CARRY_SENSITIVITY: 1.0

FEE_SPLIT:
  TO_INSURANCE: 0.5
  TO_PROTOCOL: 0.5

LEVERAGE_BUCKETS:
  - {maxLeverage: 10, bufferRatio: 0.10}
  - {maxLeverage: 20, bufferRatio: 0.20}
  - {maxLeverage: 30, bufferRatio: 0.30}
```

## Operational Flows

### Trade Lifecycle
```
1. User: deposit(amount) → userWallet += amount
2. User: openPosition(totalToUse=1000, leverage=10, isLong=true)
   → margin=~909, fee=~91 (assuming feeRate=0.001)
   → userWallet -= 1000, tradeFund += 909, fees split
   → vAMM executes, position created
3. Time passes, carry accrues (if OI imbalanced)
4. User: closePosition(positionId)
   → vAMM executes close
   → payout = margin + pnlTrade + carryPnl
   → tradeFund -= payout, userWallet += payout
5. User: withdraw(amount) → userWallet -= amount, external transfer
```

### Liquidation Lifecycle
```
1. Keeper monitors: position.equity drops below threshold
2. Keeper calls: liquidatePosition(positionId, keeperAddress)
3. Settlement:
   - Close on vAMM
   - Compute equity (may be negative)
   - Deduct liqFee from equity (or add to bad debt)
   - Transfer liqFee to keeper
   - Cover bad debt from insurance/tradeFund if needed
4. Position marked LIQUIDATED
```

## Risk Management

**Bad Debt Prevention**:
- Dynamic buffer ratios enforce earlier liquidation at high leverage
- Insurance fund absorbs first losses
- TradeFund acts as secondary backstop

**Edge Cases**:
- Zero OI: No carry accrues
- Pool exhaustion: Reject opens when remaining reserves < threshold
- Flash crashes: Same-block liquidation blocked, allows 1-block recovery

## Testing Checklist
- vAMM math: verify price/slippage at extremes (low liquidity, large orders)
- Funding: confirm longs pay when OI>shorts, vice versa
- Liquidation: verify triggers at exact buffer boundaries (10%, 20%, 30%)
- Bad debt: stress test with rapid price moves, verify insurance coverage
- Concurrency: multiple liquidators compete, verify single execution
