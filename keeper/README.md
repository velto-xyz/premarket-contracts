# Liquidation Keeper Bot

Automated bot that monitors perpetual futures positions and liquidates unhealthy ones.

## Features

- 📡 Real-time event monitoring (PositionOpened, PositionClosed, PositionLiquidated)
- 🔍 Continuous health checks for all open positions
- ⚡ Automatic liquidation of underwater positions
- 💰 Profitability checks (only liquidates if fee > gas cost)
- 🔄 Historical position syncing on startup
- 📊 Detailed logging

## Setup

### 1. Install Dependencies

```bash
cd keeper
npm install
```

### 2. Configure Environment

Copy the example environment file:

```bash
cp .env.example .env
```

Edit `.env` with your configuration:

```env
# For local development
RPC_URL=http://127.0.0.1:8545
PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80

# For testnet (Base Sepolia example)
RPC_URL=https://sepolia.base.org
PRIVATE_KEY=<your-private-key>

# Contract addresses (from deployment)
ENGINE_ADDRESS=0x...
POSITION_MANAGER_ADDRESS=0x...
LIQUIDATION_ENGINE_ADDRESS=0x...

# Bot settings
POLL_INTERVAL=12000  # Check every 12 seconds
MIN_PROFIT=1         # Minimum 1 USDC profit
```

### 3. Get Contract Addresses

After deploying contracts, addresses are saved to `.env.deployment` in the project root:

```bash
# Copy addresses from deployment
cat ../.env.deployment

# Or extract them automatically
export ENGINE_ADDRESS=$(grep ENGINE_ADDRESS ../.env.deployment | cut -d'=' -f2)
# Add to keeper/.env
```

## Usage

### Start the Bot

```bash
npm start
```

### Development Mode (Auto-restart)

```bash
npm run dev
```

### Expected Output

```
🤖 Liquidation Keeper Bot Starting...
Keeper address: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
Engine address: 0x5FbDB2315678afecb367f032d93F642f64180aa3
RPC URL: http://127.0.0.1:8545
Poll interval: 12000 ms

Connected to network: unknown (chainId: 31337)
Keeper balance: 10000.0 ETH

📡 Setting up event listeners...
✅ Event listeners active

🔄 Syncing historical positions...
  Fetching events from block 0 to 15...
  Found 3 PositionOpened events
  Currently tracking 2 open positions

🚀 Keeper bot is now running...
Press Ctrl+C to stop

🔍 Checking 2 positions...

⚠️  Position 1 is liquidatable!
🔨 Attempting to liquidate position 1...
  Current loss: 850.234
  Allowed loss: 800.0
  Liquidation fee: 5.123
  Estimated profit: 3.456
  Gas estimate: 345678
  Transaction sent: 0xabc...
  Waiting for confirmation...
  ✅ Liquidation successful!
  Gas used: 342156
  Block: 16
```

## How It Works

### 1. Event Monitoring

The bot listens for blockchain events:

- **PositionOpened**: Adds position to tracking list
- **PositionClosed**: Removes from tracking
- **PositionLiquidated**: Removes from tracking (records if we got the liquidation)

### 2. Health Checks

Every `POLL_INTERVAL` (default 12 seconds):

1. For each tracked position:
   - Call `isLiquidatable(positionId)`
   - If liquidatable, fetch full liquidation info
   - Calculate expected profit (liq fee - gas cost)

2. If profitable, attempt liquidation

### 3. Liquidation

When a position is liquidatable and profitable:

1. Estimate gas cost
2. Send `engine.liquidate(positionId)` transaction
3. Wait for confirmation
4. Log results

### 4. Profitability Check

```javascript
liqFee = await liquidationEngine.calculateLiquidationFee(positionId);
gasCost = gasPrice * estimatedGas;
profit = liqFee - gasCost;

if (profit > MIN_PROFIT) {
  liquidate();
}
```

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `RPC_URL` | Blockchain RPC endpoint | `http://127.0.0.1:8545` |
| `PRIVATE_KEY` | Keeper wallet private key | Required |
| `ENGINE_ADDRESS` | PerpEngine contract address | Required |
| `POSITION_MANAGER_ADDRESS` | PositionManager address (optional) | - |
| `LIQUIDATION_ENGINE_ADDRESS` | LiquidationEngine address (optional) | - |
| `POLL_INTERVAL` | Check interval in milliseconds | `12000` |
| `MIN_PROFIT` | Minimum profit in USDC | `1` |

### Keeper Requirements

- Sufficient ETH/native token for gas
- Sufficient USDC balance in PerpEngine (for potential bad debt coverage)
- Fast RPC endpoint (for competitive liquidations)

## Testing Locally

### 1. Start Local Node

```bash
anvil
```

### 2. Deploy Contracts

```bash
cd ..
forge script script/Deploy.s.sol --rpc-url local --broadcast
```

### 3. Update .env with Addresses

```bash
# From deployment output or .env.deployment
ENGINE_ADDRESS=0x...
```

### 4. Fund Keeper (if needed)

```javascript
// In a separate terminal
cast send $ENGINE_ADDRESS "deposit(uint256)" 10000000000 \
  --rpc-url local \
  --private-key $PRIVATE_KEY
```

### 5. Start Keeper

```bash
npm start
```

### 6. Test Liquidation

Open positions via a separate script or Cast commands to create liquidatable positions.

## Production Deployment

### Testnet (Base Sepolia)

```bash
# Set testnet RPC
export RPC_URL=https://sepolia.base.org
export PRIVATE_KEY=<your-key>

# Run bot
npm start
```

### Mainnet Considerations

⚠️ **Before running on mainnet:**

1. **Security**:
   - Use hardware wallet or KMS for private key
   - Run on secure, monitored server
   - Set up alerts for errors/downtime

2. **Performance**:
   - Use fast, reliable RPC (Alchemy, Infura, etc.)
   - Consider running your own node
   - Reduce `POLL_INTERVAL` for competitive liquidations (6-8 seconds)

3. **Economics**:
   - Fund keeper with sufficient gas token
   - Deposit USDC buffer for bad debt scenarios
   - Adjust `MIN_PROFIT` based on gas prices

4. **Monitoring**:
   - Set up logging (e.g., Winston, Pino)
   - Monitor keeper balance
   - Track liquidation success rate
   - Alert on errors

## Troubleshooting

### "Keeper has 0 balance"

Fund your keeper address with native tokens (ETH, etc.):

```bash
cast send $KEEPER_ADDRESS --value 1ether \
  --rpc-url $RPC_URL \
  --private-key $FUNDING_KEY
```

### "NotLiquidatable" Error

Position recovered or was liquidated by another keeper. This is normal in competitive environments.

### High Gas Costs

Reduce `MIN_PROFIT` or wait for lower gas prices. Consider L2s (Base, Arbitrum) for lower costs.

### Missed Liquidations

- Reduce `POLL_INTERVAL` (but increases RPC load)
- Use websockets instead of polling (requires code changes)
- Use faster RPC provider

## Advanced Features (Future)

- [ ] Multi-market monitoring
- [ ] WebSocket support for real-time updates
- [ ] MEV protection (Flashbots, private RPCs)
- [ ] Gas price optimization
- [ ] Profit tracking and statistics
- [ ] Telegram/Discord notifications
- [ ] Automatic keeper balance management

## License

MIT
