import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { usePositionStore } from './positionStore';
import { useTradeStore } from './tradeStore';
import { useMarketHistoryStore } from './marketHistoryStore';

interface BlockStore {
  lastBlockNumber: number;

  // Actions
  updateBlockNumber: (blockNumber: bigint) => void;
  checkAndHandleRestart: (currentBlock: bigint) => boolean; // Returns true if restart detected
}

export const useBlockStore = create<BlockStore>()(
  persist(
    (set, get) => ({
      lastBlockNumber: 0,

      updateBlockNumber: (blockNumber) => {
        const state = get();
        const current = Number(blockNumber);

        // Skip if this block number is older than what we've already seen
        // (events can arrive out of order)
        if (current <= state.lastBlockNumber && state.lastBlockNumber > 0) {
          // Only warn if it's significantly backwards (testnet restart)
          if (current < state.lastBlockNumber - 50) {
            console.warn('🔄 Testnet restart detected! Block number went backwards significantly.');
            console.warn(`Previous: ${state.lastBlockNumber}, Current: ${current}`);

            // Clear all stores
            usePositionStore.getState().clear();
            useTradeStore.getState().clear();
            useMarketHistoryStore.getState().clear();

            console.log('✅ All stores cleared due to testnet restart');
            set({ lastBlockNumber: current });
          }
          // Otherwise just ignore (out of order event)
          return;
        }

        // Update to higher block number
        set({ lastBlockNumber: current });
      },

      checkAndHandleRestart: (currentBlock) => {
        const state = get();
        const current = Number(currentBlock);

        // Detect significant backwards jump (testnet restart)
        const restartDetected = current < state.lastBlockNumber - 50 && state.lastBlockNumber > 0;

        if (restartDetected) {
          get().updateBlockNumber(currentBlock);
        }

        return restartDetected;
      },
    }),
    {
      name: 'block-storage',
    }
  )
);
