#!/bin/bash

# Debug transaction helper script
# Usage: ./scripts/debug-tx.sh <tx_hash>

set -e

TX_HASH=$1
RPC_URL=${RPC_URL:-"http://127.0.0.1:8545"}

if [ -z "$TX_HASH" ]; then
  echo "Usage: $0 <tx_hash>"
  echo "Example: $0 0x1234..."
  exit 1
fi

echo "🔍 Debugging transaction: $TX_HASH"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

echo "📋 Transaction Details:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
cast tx "$TX_HASH" --rpc-url "$RPC_URL"
echo ""

echo "📄 Transaction Receipt:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
cast receipt "$TX_HASH" --rpc-url "$RPC_URL"
echo ""

# Try to decode logs
echo "📜 Decoded Logs:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
cast receipt "$TX_HASH" --rpc-url "$RPC_URL" --json | jq -r '.logs[] | .topics[]' 2>/dev/null || echo "No logs found"
echo ""

# Check if transaction failed
STATUS=$(cast receipt "$TX_HASH" --rpc-url "$RPC_URL" --json | jq -r '.status' 2>/dev/null)
if [ "$STATUS" == "0x0" ]; then
  echo "❌ Transaction failed (status: 0x0)"
  echo ""

  # Try to get revert reason
  echo "🔍 Attempting to decode revert reason..."
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  # Get the transaction input and try to replay it
  TO=$(cast tx "$TX_HASH" --rpc-url "$RPC_URL" --json | jq -r '.to')
  FROM=$(cast tx "$TX_HASH" --rpc-url "$RPC_URL" --json | jq -r '.from')
  INPUT=$(cast tx "$TX_HASH" --rpc-url "$RPC_URL" --json | jq -r '.input')
  VALUE=$(cast tx "$TX_HASH" --rpc-url "$RPC_URL" --json | jq -r '.value')

  echo "Replaying transaction to extract revert reason..."
  cast call "$TO" "$INPUT" --from "$FROM" --value "$VALUE" --rpc-url "$RPC_URL" 2>&1 || true
else
  echo "✅ Transaction succeeded (status: 0x1)"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "💡 Tips:"
echo "  - Use 'cast run' to trace the transaction: cast run $TX_HASH --rpc-url $RPC_URL"
echo "  - View source code at the contract address"
echo "  - Check Anvil logs for more details"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
