# Simulation System

## Architecture

```
SimulationEngine
  └─ BotAgent[] (5 bots max)
       └─ ContractService (per bot)
       └─ TradingStrategy
```

## Key Changes

**Before:**
- Direct viem contract calls
- Impersonation via anvil_impersonateAccount
- No proper USDC funding
- Old service imports

**After:**
- Uses ContractService API layer
- Private key based wallet clients (Anvil accounts 5-9)
- Full funding flow: mint → approve → deposit
- Proper error handling via API layer

## Bot Initialization Flow

1. **Create wallet clients** - Each bot gets privateKeyToAccount(botPrivateKey)
2. **Create ContractService** - Per-bot service instance
3. **Mint USDC** - service.usdc.mint(botAddress, 10_000 USDC)
4. **Approve engine** - service.usdc.approve(engine, amount)
5. **Deposit to engine** - service.engine.deposit(engine, amount)
6. **Update balance** - Query and store in simulation state

## Trading Flow

1. **Get market data** - service.engine.getFullMarketData(engine)
2. **Get bot balance** - service.engine.getWalletBalance(engine, bot)
3. **Strategy decision** - Bot strategy processes market state
4. **Execute trade** - service.engine.openPosition() or closePosition()
5. **Update state** - Track positionId, update counts

## Bot Accounts (Anvil Default)

All accounts have ETH by default on Anvil:
- Account 5: 0x15d34AAf... (index 5)
- Account 6: 0x9965507D... (index 6)
- Account 7: 0x976EA740... (index 7)
- Account 8: 0x14dC7996... (index 8)
- Account 9: 0x23618e81... (index 9)

**WARNING:** These are public test keys. Never use in production.

## Contract Service Usage

```ts
// Each bot has its own service instance
bot.service.usdc.mint(address, amount)
bot.service.usdc.approve(spender, amount)
bot.service.engine.deposit(engine, amount)
bot.service.engine.openPosition(engine, isLong, totalToUse, leverage)
bot.service.engine.closePosition(engine, positionId)
bot.service.engine.getFullMarketData(engine) // Aggregated market state
bot.service.engine.getWalletBalance(engine, user)
```

## Error Handling

All contract errors are decoded and propagated with meaningful messages:
- "Contract Error: InsufficientBalance"
- "Contract Error: InvalidLeverage"
- "Transaction rejected by user"
- etc.

Error handling happens in ContractService, bots just log the message.
