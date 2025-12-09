import { useEffect, useRef, useCallback } from 'react';
import { useAccount, usePublicClient, useWatchContractEvent } from 'wagmi';
import { usePositionStore } from '../store/positionStore';
import { useTradeStore } from '../store/tradeStore';
import { useBlockStore } from '../store/blockStore';
import { useMarketStore } from '../store/marketStore';
import { ABIS } from '../contract-api';
import type { Address } from 'viem';

/**
 * Hook to sync positions from contract and listen to events
 * - Fetches user's open positions on mount
 * - Listens to PositionOpened/Closed/Liquidated events
 * - Updates stores accordingly
 */
export function usePositionSync() {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { selectedMarket } = useMarketStore();

  // Use refs to avoid recreating event handlers
  const addPositionRef = useRef(usePositionStore.getState().addPosition);
  const removePositionRef = useRef(usePositionStore.getState().removePosition);
  const addTradeRef = useRef(useTradeStore.getState().addTrade);
  const updateBlockNumberRef = useRef(useBlockStore.getState().updateBlockNumber);

  // Update refs when store functions change (they shouldn't, but just in case)
  useEffect(() => {
    addPositionRef.current = usePositionStore.getState().addPosition;
    removePositionRef.current = usePositionStore.getState().removePosition;
    addTradeRef.current = useTradeStore.getState().addTrade;
    updateBlockNumberRef.current = useBlockStore.getState().updateBlockNumber;
  });

  // Fetch historical positions from events on mount
  const hasFetchedHistory = useRef(false);
  useEffect(() => {
    if (!address || !selectedMarket || !publicClient) return;

    const key = `${address}-${selectedMarket}`;
    if (hasFetchedHistory.current === key) return;

    const fetchHistoricalPositions = async () => {
      try {
        // Get current block
        const currentBlock = await publicClient.getBlockNumber();

        // Fetch PositionOpened events (last 10000 blocks)
        const fromBlock = currentBlock > 10000n ? currentBlock - 10000n : 0n;

        const openLogs = await publicClient.getLogs({
          address: selectedMarket as Address,
          event: {
            type: 'event',
            name: 'PositionOpened',
            inputs: [
              { type: 'uint256', indexed: true, name: 'positionId' },
              { type: 'address', indexed: true, name: 'user' },
              { type: 'bool', indexed: true, name: 'isLong' },
              { type: 'uint256', indexed: false, name: 'totalToUse' },
              { type: 'uint256', indexed: false, name: 'margin' },
              { type: 'uint256', indexed: false, name: 'fee' },
              { type: 'uint256', indexed: false, name: 'leverage' },
              { type: 'uint256', indexed: false, name: 'baseSize' },
              { type: 'uint256', indexed: false, name: 'entryPrice' },
            ],
          },
          fromBlock,
          toBlock: 'latest',
        });

        // Fetch PositionClosed events
        const closeLogs = await publicClient.getLogs({
          address: selectedMarket as Address,
          event: {
            type: 'event',
            name: 'PositionClosed',
            inputs: [
              { type: 'uint256', indexed: true, name: 'positionId' },
              { type: 'address', indexed: true, name: 'user' },
              { type: 'int256', indexed: false, name: 'totalPnl' },
              { type: 'uint256', indexed: false, name: 'avgClosePrice' },
            ],
          },
          fromBlock,
          toBlock: 'latest',
        });

        // Build set of closed position IDs
        const closedPositionIds = new Set(
          closeLogs.map(log => (log.args as any).positionId.toString())
        );

        // Add open positions to store
        for (const log of openLogs) {
          const args = log.args as any;

          // Skip if position was closed
          if (closedPositionIds.has(args.positionId.toString())) continue;

          // Add to position store
          addPositionRef.current({
            id: args.positionId,
            user: args.user,
            engine: selectedMarket as Address,
            isLong: args.isLong,
            baseSize: args.baseSize,
            entryPrice: args.entryPrice,
            entryNotional: args.baseSize * args.entryPrice / 10n ** 18n,
            margin: args.margin,
            leverage: args.leverage,
            carrySnapshot: 0n,
            openBlock: BigInt(log.blockNumber),
            status: 0,
            realizedPnl: 0n,
          });

          // Add to trade history
          addTradeRef.current({
            id: `open-${args.positionId}-${log.transactionHash}`,
            type: 'open' as const,
            timestamp: Date.now(), // Use current time since we don't have block timestamp
            blockNumber: BigInt(log.blockNumber),
            transactionHash: log.transactionHash as string,
            positionId: args.positionId,
            user: args.user,
            engine: selectedMarket as Address,
            isLong: args.isLong,
            margin: args.margin,
            leverage: args.leverage,
            baseSize: args.baseSize,
            entryPrice: args.entryPrice,
            fee: args.fee,
          });
        }

        // Add close trades to history
        for (const log of closeLogs) {
          const args = log.args as any;

          addTradeRef.current({
            id: `close-${args.positionId}-${log.transactionHash}`,
            type: 'close' as const,
            timestamp: Date.now(),
            blockNumber: BigInt(log.blockNumber),
            transactionHash: log.transactionHash as string,
            positionId: args.positionId,
            user: args.user,
            engine: selectedMarket as Address,
            totalPnl: args.totalPnl,
            avgClosePrice: args.avgClosePrice,
          });
        }

        hasFetchedHistory.current = key;
      } catch (error) {
        console.error('Failed to fetch historical positions:', error);
      }
    };

    fetchHistoricalPositions();
  }, [address, selectedMarket, publicClient]);

  // Listen for PositionOpened events
  useWatchContractEvent({
    address: selectedMarket as Address,
    abi: ABIS.PerpEngine,
    eventName: 'PositionOpened',
    enabled: !!selectedMarket,
    onLogs(logs) {
      logs.forEach((log) => {
        const args = log.args as any;

        // Update block number
        updateBlockNumberRef.current(BigInt(log.blockNumber));

        // Add position to store
        addPositionRef.current({
          id: args.positionId,
          user: args.user,
          engine: selectedMarket as Address,
          isLong: args.isLong,
          baseSize: args.baseSize,
          entryPrice: args.entryPrice,
          entryNotional: args.baseSize * args.entryPrice / 10n ** 18n,
          margin: args.margin,
          leverage: args.leverage,
          carrySnapshot: 0n,
          openBlock: BigInt(log.blockNumber),
          status: 0,
          realizedPnl: 0n,
        });

        // Add trade to history
        addTradeRef.current({
          id: `open-${args.positionId}-${log.transactionHash}`,
          type: 'open' as const,
          timestamp: Date.now(),
          blockNumber: BigInt(log.blockNumber),
          transactionHash: log.transactionHash,
          positionId: args.positionId,
          user: args.user,
          engine: selectedMarket as Address,
          isLong: args.isLong,
          margin: args.margin,
          leverage: args.leverage,
          baseSize: args.baseSize,
          entryPrice: args.entryPrice,
          fee: args.fee,
        });
      });
    },
  });

  // Listen for PositionClosed events
  useWatchContractEvent({
    address: selectedMarket as Address,
    abi: ABIS.PerpEngine,
    eventName: 'PositionClosed',
    enabled: !!selectedMarket,
    onLogs(logs) {
      logs.forEach((log) => {
        const args = log.args as any;

        // Update block number
        updateBlockNumberRef.current(BigInt(log.blockNumber));

        // Remove position from store
        removePositionRef.current(args.positionId);

        // Add trade to history
        addTradeRef.current({
          id: `close-${args.positionId}-${log.transactionHash}`,
          type: 'close' as const,
          timestamp: Date.now(),
          blockNumber: BigInt(log.blockNumber),
          transactionHash: log.transactionHash,
          positionId: args.positionId,
          user: args.user,
          engine: selectedMarket as Address,
          totalPnl: args.totalPnl,
          avgClosePrice: args.avgClosePrice,
        });
      });
    },
  });

  // Listen for PositionLiquidated events
  useWatchContractEvent({
    address: selectedMarket as Address,
    abi: ABIS.PerpEngine,
    eventName: 'PositionLiquidated',
    enabled: !!selectedMarket,
    onLogs(logs) {
      logs.forEach((log) => {
        const args = log.args as any;

        // Update block number
        updateBlockNumberRef.current(BigInt(log.blockNumber));

        // Remove position from store
        removePositionRef.current(args.positionId);

        // Add trade to history
        addTradeRef.current({
          id: `liq-${args.positionId}-${log.transactionHash}`,
          type: 'liquidation' as const,
          timestamp: Date.now(),
          blockNumber: BigInt(log.blockNumber),
          transactionHash: log.transactionHash,
          positionId: args.positionId,
          user: args.user,
          liquidator: args.liquidator,
          liquidatorReward: args.liqFee,
        });
      });
    },
  });

  // Update block number periodically
  useEffect(() => {
    if (!publicClient) return;

    const updateBlock = async () => {
      try {
        const currentBlock = await publicClient.getBlockNumber();
        updateBlockNumberRef.current(currentBlock);
      } catch (error) {
        console.error('Failed to get block number:', error);
      }
    };

    updateBlock();
    const interval = setInterval(updateBlock, 5000);

    return () => clearInterval(interval);
  }, [publicClient]);
}
