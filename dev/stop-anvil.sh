#!/bin/bash

# Stop Anvil script

if [ -f .anvil.pid ]; then
    ANVIL_PID=$(cat .anvil.pid)
    echo "🛑 Stopping Anvil (PID: $ANVIL_PID)..."
    kill $ANVIL_PID 2>/dev/null || echo "⚠️  Process already stopped"
    rm .anvil.pid
    echo "✅ Anvil stopped"
else
    echo "⚠️  No .anvil.pid file found"
    echo "Checking for Anvil on port 8545..."
    if lsof -Pi :8545 -sTCP:LISTEN -t >/dev/null 2>&1 ; then
        PID=$(lsof -t -i:8545)
        echo "Found process $PID, killing..."
        kill $PID
        echo "✅ Anvil stopped"
    else
        echo "ℹ️  Anvil is not running"
    fi
fi
