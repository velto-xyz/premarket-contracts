import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface MarketSnapshot {
  timestamp: number;
  blockNumber: bigint;
  markPrice: bigint;
  baseReserve: bigint;
  quoteReserve: bigint;
  longOI: bigint;
  shortOI: bigint;
  netOI: bigint;
  carryIndex: bigint;
  tradeFund: bigint;
  insuranceFund: bigint;
  protocolFees: bigint;
}

interface MarketHistoryStore {
  history: MarketSnapshot[]; // All snapshots, oldest first

  // Actions
  addSnapshot: (snapshot: MarketSnapshot) => void;
  getHistory: () => MarketSnapshot[];
  clear: () => void;
}

export const useMarketHistoryStore = create<MarketHistoryStore>()(
  persist(
    (set, get) => ({
      history: [],

      addSnapshot: (snapshot) =>
        set((state) => {
          // Check if snapshot with same timestamp and blockNumber exists
          const exists = state.history.some(
            s => s.timestamp === snapshot.timestamp && s.blockNumber === snapshot.blockNumber
          );
          if (exists) {
            return state;
          }
          return {
            history: [...state.history, snapshot],
          };
        }),

      getHistory: () => get().history,

      clear: () => set({ history: [] }),
    }),
    {
      name: 'market-history-storage',
      storage: {
        getItem: (name) => {
          const str = localStorage.getItem(name);
          if (!str) return null;
          const { state } = JSON.parse(str);

          // Convert string values back to BigInt
          const history: MarketSnapshot[] = (state.history || []).map((snap: any) => ({
            ...snap,
            blockNumber: BigInt(snap.blockNumber),
            markPrice: BigInt(snap.markPrice),
            baseReserve: BigInt(snap.baseReserve),
            quoteReserve: BigInt(snap.quoteReserve),
            longOI: BigInt(snap.longOI),
            shortOI: BigInt(snap.shortOI),
            netOI: BigInt(snap.netOI),
            carryIndex: BigInt(snap.carryIndex),
            tradeFund: BigInt(snap.tradeFund),
            insuranceFund: BigInt(snap.insuranceFund),
            protocolFees: BigInt(snap.protocolFees),
          }));

          return { state: { history } };
        },
        setItem: (name, value) => {
          // Convert BigInt to strings for JSON serialization
          const history = value.state.history.map((snap: MarketSnapshot) => ({
            ...snap,
            blockNumber: snap.blockNumber.toString(),
            markPrice: snap.markPrice.toString(),
            baseReserve: snap.baseReserve.toString(),
            quoteReserve: snap.quoteReserve.toString(),
            longOI: snap.longOI.toString(),
            shortOI: snap.shortOI.toString(),
            netOI: snap.netOI.toString(),
            carryIndex: snap.carryIndex.toString(),
            tradeFund: snap.tradeFund.toString(),
            insuranceFund: snap.insuranceFund.toString(),
            protocolFees: snap.protocolFees.toString(),
          }));

          localStorage.setItem(name, JSON.stringify({
            state: { history },
          }));
        },
        removeItem: (name) => localStorage.removeItem(name),
      },
    }
  )
);
