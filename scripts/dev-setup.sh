#!/bin/bash

# Dev Setup Script
# Builds contracts, deploys to Anvil (starting it if needed), exports ABIs
# Keeps Anvil running in foreground with visible output

set -e

echo "🚀 Perp DEX Development Setup"
echo ""

# 1. Build contracts
echo "1️⃣  Building contracts..."
forge build

# 2. Export ABIs
echo ""
echo "2️⃣  Exporting ABIs..."
task abi:export

# 3. Check if Anvil is running
echo ""
if lsof -Pi :8545 -sTCP:LISTEN -t >/dev/null 2>&1 ; then
    echo "✅ Anvil already running on port 8545"
    ANVIL_RUNNING=true
else
    echo "3️⃣  Starting Anvil..."
    # Start Anvil in background temporarily for deployment
    anvil --block-time 1 --accounts 10 > /tmp/anvil-startup.log 2>&1 &
    ANVIL_PID=$!
    echo $ANVIL_PID > .anvil.pid
    sleep 2

    # Verify it started
    if ! lsof -Pi :8545 -sTCP:LISTEN -t >/dev/null 2>&1 ; then
        echo "❌ Failed to start Anvil"
        cat /tmp/anvil-startup.log
        exit 1
    fi
    echo "   Anvil PID: $ANVIL_PID"
    ANVIL_RUNNING=false
fi

# 4. Deploy contracts
echo ""
echo "4️⃣  Deploying contracts..."
export PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
forge script script/DevDeploy.s.sol --rpc-url http://127.0.0.1:8545 --broadcast --legacy

echo ""
echo "✅ Setup complete!"
echo ""
echo "📝 Contract addresses written to:"
echo "   - web/.env.development"
echo "   - deployments.json"
echo ""

# If we started Anvil, switch to foreground mode
if [ "$ANVIL_RUNNING" = false ]; then
    echo "🔧 Anvil is now running (Ctrl+C to stop)..."
    echo "   Watching transactions..."
    echo ""

    # Kill background process and restart in foreground
    kill $ANVIL_PID 2>/dev/null || true
    sleep 1

    # Start in foreground
    exec anvil --block-time 1 --accounts 10
else
    echo "🔧 Using existing Anvil instance"
    echo ""
    echo "🌐 Next steps:"
    echo "   task web:dev        # Start web interface"
    echo ""
fi
