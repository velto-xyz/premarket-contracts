import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Address } from 'viem';

export type TradeType = 'open' | 'close' | 'liquidation';

export interface Trade {
  id: string;
  type: TradeType;
  timestamp: number;
  blockNumber: bigint;
  transactionHash: string;
  positionId: bigint;
  user: Address;
  engine: Address; // Market/engine address

  // Open position fields
  isLong?: boolean;
  margin?: bigint;
  leverage?: bigint;
  baseSize?: bigint;
  entryPrice?: bigint;
  fee?: bigint;

  // Close position fields
  totalPnl?: bigint;
  avgClosePrice?: bigint;

  // Liquidation fields
  liquidator?: Address;
  liquidatorReward?: bigint;
}

interface TradeStore {
  trades: Trade[]; // All trades, newest first

  // Actions
  addTrade: (trade: Trade) => void;
  addTrades: (trades: Trade[]) => void;
  getTradesByUser: (userAddress: Address) => Trade[];
  getTradesByPosition: (positionId: bigint) => Trade[];
  getTradesByMarket: (engineAddress: Address) => Trade[];
  clear: () => void;
}

export const useTradeStore = create<TradeStore>()(
  persist(
    (set, get) => ({
      trades: [],

      addTrade: (trade) =>
        set((state) => {
          // Check if trade already exists
          if (state.trades.some(t => t.id === trade.id)) {
            return state;
          }
          return {
            trades: [trade, ...state.trades],
          };
        }),

      addTrades: (trades) =>
        set((state) => {
          // Filter out trades that already exist
          const existingIds = new Set(state.trades.map(t => t.id));
          const newTrades = trades.filter(t => !existingIds.has(t.id));
          return {
            trades: [...newTrades, ...state.trades],
          };
        }),

      getTradesByUser: (userAddress) => {
        const state = get();
        const userKey = userAddress.toLowerCase();
        return state.trades.filter(
          (trade) => trade.user.toLowerCase() === userKey
        );
      },

      getTradesByPosition: (positionId) => {
        const state = get();
        return state.trades.filter((trade) => trade.positionId === positionId);
      },

      getTradesByMarket: (engineAddress) => {
        const state = get();
        const engineKey = engineAddress.toLowerCase();
        return state.trades.filter(
          (trade) => trade.engine.toLowerCase() === engineKey
        );
      },

      clear: () => set({ trades: [] }),
    }),
    {
      name: 'trade-storage',
      storage: {
        getItem: (name) => {
          const str = localStorage.getItem(name);
          if (!str) return null;
          const { state } = JSON.parse(str);

          // Convert string values back to BigInt
          const trades: Trade[] = (state.trades || []).map((trade: any) => ({
            ...trade,
            blockNumber: BigInt(trade.blockNumber),
            positionId: BigInt(trade.positionId),
            margin: trade.margin !== undefined ? BigInt(trade.margin) : undefined,
            leverage: trade.leverage !== undefined ? BigInt(trade.leverage) : undefined,
            baseSize: trade.baseSize !== undefined ? BigInt(trade.baseSize) : undefined,
            entryPrice: trade.entryPrice !== undefined ? BigInt(trade.entryPrice) : undefined,
            fee: trade.fee !== undefined ? BigInt(trade.fee) : undefined,
            totalPnl: trade.totalPnl !== undefined ? BigInt(trade.totalPnl) : undefined,
            avgClosePrice: trade.avgClosePrice !== undefined ? BigInt(trade.avgClosePrice) : undefined,
            liquidatorReward: trade.liquidatorReward !== undefined ? BigInt(trade.liquidatorReward) : undefined,
          }));

          return { state: { trades } };
        },
        setItem: (name, value) => {
          // Convert BigInt to strings for JSON serialization
          const trades = value.state.trades.map((trade: Trade) => ({
            ...trade,
            blockNumber: trade.blockNumber.toString(),
            positionId: trade.positionId.toString(),
            margin: trade.margin !== undefined ? trade.margin.toString() : undefined,
            leverage: trade.leverage !== undefined ? trade.leverage.toString() : undefined,
            baseSize: trade.baseSize !== undefined ? trade.baseSize.toString() : undefined,
            entryPrice: trade.entryPrice !== undefined ? trade.entryPrice.toString() : undefined,
            fee: trade.fee !== undefined ? trade.fee.toString() : undefined,
            totalPnl: trade.totalPnl !== undefined ? trade.totalPnl.toString() : undefined,
            avgClosePrice: trade.avgClosePrice !== undefined ? trade.avgClosePrice.toString() : undefined,
            liquidatorReward: trade.liquidatorReward !== undefined ? trade.liquidatorReward.toString() : undefined,
          }));

          localStorage.setItem(name, JSON.stringify({
            state: { trades },
          }));
        },
        removeItem: (name) => localStorage.removeItem(name),
      },
    }
  )
);
