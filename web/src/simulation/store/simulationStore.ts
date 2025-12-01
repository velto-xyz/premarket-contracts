import { create } from 'zustand';
import type { ScenarioType } from '../scenarios';

export type SimulationStatus = 'stopped' | 'running' | 'paused';

export interface SimulationStats {
  tradesExecuted: number;
  liquidationsTriggered: number;
  totalVolume: bigint;
  netPnL: bigint;
  blocksSimulated: number;
  startTime: number | null;
}

export interface SimulationConfig {
  scenario: ScenarioType;
  botCount: number;
  speedMultiplier: number; // 1x-10x
}

export interface BotWallet {
  address: `0x${string}`;
  accountIndex: number; // 5-9 for Anvil accounts
  balance: bigint;
  activePositions: bigint[]; // Position IDs
}

interface SimulationState {
  // Status
  status: SimulationStatus;

  // Configuration
  config: SimulationConfig;

  // Stats
  stats: SimulationStats;

  // Bot wallets
  botWallets: BotWallet[];

  // Actions
  start: () => void;
  pause: () => void;
  stop: () => void;
  reset: () => void;

  setConfig: (config: Partial<SimulationConfig>) => void;
  updateStats: (stats: Partial<SimulationStats>) => void;
  incrementTrades: () => void;
  incrementLiquidations: () => void;
  addVolume: (volume: bigint) => void;
  addPnL: (pnl: bigint) => void;
  incrementBlocks: (count: number) => void;

  setBotWallets: (wallets: BotWallet[]) => void;
  updateBotPosition: (botAddress: `0x${string}`, positionId: bigint, action: 'add' | 'remove') => void;
}

const initialStats: SimulationStats = {
  tradesExecuted: 0,
  liquidationsTriggered: 0,
  totalVolume: 0n,
  netPnL: 0n,
  blocksSimulated: 0,
  startTime: null,
};

const initialConfig: SimulationConfig = {
  scenario: 'low-intensity',
  botCount: 3,
  speedMultiplier: 1,
};

export const useSimulationStore = create<SimulationState>((set) => ({
  // Initial state
  status: 'stopped',
  config: initialConfig,
  stats: initialStats,
  botWallets: [],

  // Status actions
  start: () => set((state) => ({
    status: 'running',
    stats: state.stats.startTime ? state.stats : { ...state.stats, startTime: Date.now() },
  })),

  pause: () => set({ status: 'paused' }),

  stop: () => set({ status: 'stopped' }),

  reset: () => set({
    status: 'stopped',
    stats: initialStats,
    botWallets: [],
  }),

  // Configuration
  setConfig: (newConfig) => set((state) => ({
    config: { ...state.config, ...newConfig },
  })),

  // Stats updates
  updateStats: (newStats) => set((state) => ({
    stats: { ...state.stats, ...newStats },
  })),

  incrementTrades: () => set((state) => ({
    stats: { ...state.stats, tradesExecuted: state.stats.tradesExecuted + 1 },
  })),

  incrementLiquidations: () => set((state) => ({
    stats: { ...state.stats, liquidationsTriggered: state.stats.liquidationsTriggered + 1 },
  })),

  addVolume: (volume) => set((state) => ({
    stats: { ...state.stats, totalVolume: state.stats.totalVolume + volume },
  })),

  addPnL: (pnl) => set((state) => ({
    stats: { ...state.stats, netPnL: state.stats.netPnL + pnl },
  })),

  incrementBlocks: (count) => set((state) => ({
    stats: { ...state.stats, blocksSimulated: state.stats.blocksSimulated + count },
  })),

  // Bot wallet management
  setBotWallets: (wallets) => set({ botWallets: wallets }),

  updateBotPosition: (botAddress, positionId, action) => set((state) => ({
    botWallets: state.botWallets.map((wallet) =>
      wallet.address === botAddress
        ? {
            ...wallet,
            activePositions:
              action === 'add'
                ? [...wallet.activePositions, positionId]
                : wallet.activePositions.filter((id) => id !== positionId),
          }
        : wallet
    ),
  })),
}));

// Helper function to check if address is a bot wallet
export function isBotWallet(address: `0x${string}`, botWallets: BotWallet[]): boolean {
  return botWallets.some((wallet) => wallet.address.toLowerCase() === address.toLowerCase());
}
