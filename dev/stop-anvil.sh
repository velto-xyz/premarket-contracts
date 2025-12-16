#!/bin/bash

# Stop all dev services

echo "🛑 Stopping services..."

# Stop indexer
if [ -f .indexer.pid ]; then
    INDEXER_PID=$(cat .indexer.pid)
    echo "Stopping indexer (PID: $INDEXER_PID)..."
    kill $INDEXER_PID 2>/dev/null || true
    rm .indexer.pid
fi

# Stop indexer Docker
cd indexer && npx envio local docker down 2>/dev/null && cd .. || true

# Stop Anvil
if [ -f .anvil.pid ]; then
    ANVIL_PID=$(cat .anvil.pid)
    echo "Stopping Anvil (PID: $ANVIL_PID)..."
    kill $ANVIL_PID 2>/dev/null || echo "Process already stopped"
    rm .anvil.pid
else
    echo "Checking for Anvil on port 8545..."
    if lsof -Pi :8545 -sTCP:LISTEN -t >/dev/null 2>&1 ; then
        PID=$(lsof -t -i:8545)
        echo "Found process $PID, killing..."
        kill $PID
    fi
fi

echo "✅ Services stopped"
