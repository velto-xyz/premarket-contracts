import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Address } from 'viem';

export interface Position {
  id: bigint;
  user: Address;
  engine: Address; // Market/engine address
  isLong: boolean;
  baseSize: bigint;
  entryPrice: bigint;
  entryNotional: bigint;
  margin: bigint;
  leverage: bigint;
  carrySnapshot: bigint;
  openBlock: bigint;
  status: number; // 0=Open, 1=Closed, 2=Liquidated
  realizedPnl: bigint;
}

interface PositionStore {
  positions: Record<string, Position>; // positionId -> Position
  userPositions: Record<Address, bigint[]>; // user -> positionIds[]

  // Actions
  addPosition: (position: Position) => void;
  removePosition: (positionId: bigint) => void;
  updatePosition: (positionId: bigint, updates: Partial<Position>) => void;
  setPositions: (positions: Position[]) => void;
  getUserPositions: (userAddress: Address) => Position[];
  getPositionsByMarket: (engineAddress: Address) => Position[];
  clear: () => void;
}

export const usePositionStore = create<PositionStore>()(
  persist(
    (set, get) => ({
      positions: {},
      userPositions: {},

      addPosition: (position) =>
        set((state) => {
          const posKey = position.id.toString();
          const userKey = position.user.toLowerCase() as Address;

          // Check if position already exists
          if (state.positions[posKey]) {
            return state;
          }

          return {
            positions: {
              ...state.positions,
              [posKey]: position,
            },
            userPositions: {
              ...state.userPositions,
              [userKey]: [
                ...(state.userPositions[userKey] || []),
                position.id,
              ],
            },
          };
        }),

      removePosition: (positionId) =>
        set((state) => {
          const posKey = positionId.toString();
          const position = state.positions[posKey];
          if (!position) return state;

          const userKey = position.user.toLowerCase() as Address;
          const { [posKey]: removed, ...remainingPositions } = state.positions;

          return {
            positions: remainingPositions,
            userPositions: {
              ...state.userPositions,
              [userKey]: (state.userPositions[userKey] || []).filter(
                (id) => id !== positionId
              ),
            },
          };
        }),

      updatePosition: (positionId, updates) =>
        set((state) => {
          const posKey = positionId.toString();
          const existing = state.positions[posKey];
          if (!existing) return state;

          return {
            positions: {
              ...state.positions,
              [posKey]: { ...existing, ...updates },
            },
          };
        }),

      setPositions: (positions) =>
        set((state) => {
          const posMap: Record<string, Position> = { ...state.positions };
          const userPosMap: Record<Address, bigint[]> = { ...state.userPositions };

          positions.forEach((pos) => {
            const posKey = pos.id.toString();
            const userKey = pos.user.toLowerCase() as Address;

            // Skip if already exists
            if (posMap[posKey]) return;

            posMap[posKey] = pos;
            if (!userPosMap[userKey]) {
              userPosMap[userKey] = [];
            }
            userPosMap[userKey].push(pos.id);
          });

          return {
            positions: posMap,
            userPositions: userPosMap,
          };
        }),

      getUserPositions: (userAddress) => {
        const state = get();
        const userKey = userAddress.toLowerCase() as Address;
        const positionIds = state.userPositions[userKey] || [];
        return positionIds
          .map((id) => state.positions[id.toString()])
          .filter(Boolean);
      },

      getPositionsByMarket: (engineAddress) => {
        const state = get();
        const engineKey = engineAddress.toLowerCase();
        return Object.values(state.positions).filter(
          (pos) => pos.engine.toLowerCase() === engineKey
        );
      },

      clear: () => set({ positions: {}, userPositions: {} }),
    }),
    {
      name: 'position-storage',
      storage: {
        getItem: (name) => {
          const str = localStorage.getItem(name);
          if (!str) return null;
          const { state } = JSON.parse(str);

          // Convert string position IDs back to BigInt
          const positions: Record<string, Position> = {};
          Object.entries(state.positions || {}).forEach(([key, pos]: [string, any]) => {
            positions[key] = {
              ...pos,
              id: BigInt(pos.id),
              baseSize: BigInt(pos.baseSize),
              entryPrice: BigInt(pos.entryPrice),
              entryNotional: BigInt(pos.entryNotional),
              margin: BigInt(pos.margin),
              leverage: BigInt(pos.leverage),
              carrySnapshot: BigInt(pos.carrySnapshot),
              openBlock: BigInt(pos.openBlock),
              realizedPnl: BigInt(pos.realizedPnl),
            };
          });

          const userPositions: Record<Address, bigint[]> = {};
          Object.entries(state.userPositions || {}).forEach(([key, ids]: [string, any]) => {
            userPositions[key as Address] = ids.map((id: string) => BigInt(id));
          });

          return { state: { positions, userPositions } };
        },
        setItem: (name, value) => {
          // Convert BigInt to strings for JSON serialization
          const positions: Record<string, any> = {};
          Object.entries(value.state.positions).forEach(([key, pos]) => {
            positions[key] = {
              ...pos,
              id: pos.id.toString(),
              baseSize: pos.baseSize.toString(),
              entryPrice: pos.entryPrice.toString(),
              entryNotional: pos.entryNotional.toString(),
              margin: pos.margin.toString(),
              leverage: pos.leverage.toString(),
              carrySnapshot: pos.carrySnapshot.toString(),
              openBlock: pos.openBlock.toString(),
              realizedPnl: pos.realizedPnl.toString(),
            };
          });

          const userPositions: Record<string, string[]> = {};
          Object.entries(value.state.userPositions).forEach(([key, ids]) => {
            userPositions[key] = (ids as bigint[]).map(id => id.toString());
          });

          localStorage.setItem(name, JSON.stringify({
            state: { positions, userPositions },
          }));
        },
        removeItem: (name) => localStorage.removeItem(name),
      },
    }
  )
);
