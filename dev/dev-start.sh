#!/usr/bin/env bash

# Check if anvil is already running
if lsof -Pi :8545 -sTCP:LISTEN -t >/dev/null 2>&1 ; then
  echo "⚠️  Port 8545 already in use. Run 'task dev:stop' first."
  exit 1
fi

# Cleanup on exit
cleanup() {
  echo ""
  echo "🛑 Stopping services..."

  # Stop indexer
  if [ -f .indexer.pid ]; then
    kill $(cat .indexer.pid) 2>/dev/null || true
    rm .indexer.pid
  fi

  # Stop anvil
  if [ -f .anvil.pid ]; then
    kill $(cat .anvil.pid) 2>/dev/null || true
    rm .anvil.pid
  fi
}

trap cleanup EXIT

# Start Anvil in background
echo "🚀 Starting Anvil..."
anvil --block-time 1 --accounts 10 &
ANVIL_PID=$!
echo $ANVIL_PID > .anvil.pid

# Wait for anvil to be ready
sleep 2

# Deploy contracts
echo ""
echo "📦 Deploying contracts..."
PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 forge script script/01_DeployCore.s.sol --rpc-url http://127.0.0.1:8545 --broadcast
PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 forge script script/02_SetupLocal.s.sol --rpc-url http://127.0.0.1:8545 --broadcast

# Build SDK
echo ""
echo "🔨 Building SDK..."
cd sdk && npm run build && cd ..

# Setup and start indexer
echo ""
echo "📊 Setting up indexer..."
cd indexer
npm run dev > ../indexer.log 2>&1 &
INDEXER_PID=$!
echo $INDEXER_PID > ../.indexer.pid
cd ..

echo ""
echo "✅ Local testnet ready:"
echo "   • Anvil RPC:     http://127.0.0.1:8545"
echo "   • Indexer API:   http://127.0.0.1:8080/graphql"
echo ""
echo "Press Ctrl+C to stop all services"
echo ""

# Wait for anvil process (keeps script running)
wait $ANVIL_PID
