# Premarket Contracts

Perpetual futures DEX with virtual AMM (vAMM) and isolated markets.

## Architecture

- **Contracts**: Solidity perpetual futures engine with Foundry
- **Web**: React + Vite frontend with wagmi/viem
- **Simulation**: Bot trading simulation on Anvil

## Quick Start

### Local Development

```bash
# Install dependencies
forge install
cd web && npm install

# Start local node + deploy + launch web
task dev:start
task web:dev
```

### Testnet Deployment

```bash
# Configure .env with PRIVATE_KEY and ETHERSCAN_API_KEY
cp .env.example .env

# Deploy to Base Sepolia
task deploy:testnet

# Verify contracts (if needed)
forge verify-contract --chain 84532 --verifier etherscan \
  --etherscan-api-key $ETHERSCAN_API_KEY \
  <CONTRACT_ADDRESS> src/ContractName.sol:ContractName
```

## Key Commands

```bash
# Contracts
task build             # Build contracts
task test              # Run tests
task deploy:local      # Deploy to Anvil
task deploy:testnet    # Deploy to testnet

# Web
task web:dev           # Dev server
task web:build         # Production build

# Full workflow
task dev:setup         # Build + deploy + export ABIs
task dev:start         # One-command local setup
```

## Configuration

- **Contracts**: Addresses stored in `deployments.json`
- **Networks**: Anvil (31337), Base Sepolia (84532)
- **Web**: Reads from `deployments.json` via contract-api layer

## Features

- Create isolated perpetual markets
- Long/short positions with leverage
- Virtual AMM (vAMM) pricing
- Carry cost mechanism (OI imbalance fee)
- Liquidation engine
- Trading simulation (Anvil only)
