export type ScenarioType =
  | 'low-intensity'
  | 'high-volatility'
  | 'longs-only'
  | 'shorts-only'
  | 'flash-attack';

export type StrategyType = 'random' | 'momentum' | 'mean-reversion' | 'flash-attack';

export interface ScenarioConfig {
  name: string;
  description: string;
  botCount: number;
  tradesPerBlock: [number, number]; // [min, max]
  positionSize: [number, number]; // USDC amount [min, max]
  leverage: [number, number]; // Leverage multiplier [min, max]
  longShortRatio: number; // 0.0-1.0 (0=all shorts, 1=all longs, 0.5=balanced)
  strategyWeights: Record<StrategyType, number>; // Distribution of strategies
  blockAdvanceRate: number; // How many blocks to advance per tick
}

export const SCENARIOS: Record<ScenarioType, ScenarioConfig> = {
  'low-intensity': {
    name: 'Low Intensity',
    description: 'Slow, conservative trading with low leverage',
    botCount: 3,
    tradesPerBlock: [1, 2],
    positionSize: [100, 500], // 100-500 USDC
    leverage: [1, 5], // 1x-5x leverage
    longShortRatio: 0.5, // Balanced
    strategyWeights: {
      random: 1.0,
      momentum: 0.0,
      'mean-reversion': 0.0,
      'flash-attack': 0.0,
    },
    blockAdvanceRate: 1,
  },

  'high-volatility': {
    name: 'High Volatility',
    description: 'Rapid trading with high leverage and mixed strategies',
    botCount: 8,
    tradesPerBlock: [3, 8],
    positionSize: [500, 2000], // 500-2k USDC
    leverage: [10, 25], // 10x-25x leverage
    longShortRatio: 0.5, // Balanced
    strategyWeights: {
      random: 0.3,
      momentum: 0.4,
      'mean-reversion': 0.3,
      'flash-attack': 0.0,
    },
    blockAdvanceRate: 2,
  },

  'longs-only': {
    name: 'Longs Only',
    description: 'All bots open long positions to test positive OI',
    botCount: 5,
    tradesPerBlock: [2, 4],
    positionSize: [200, 1000],
    leverage: [5, 15],
    longShortRatio: 1.0, // All longs
    strategyWeights: {
      random: 0.6,
      momentum: 0.4,
      'mean-reversion': 0.0,
      'flash-attack': 0.0,
    },
    blockAdvanceRate: 1,
  },

  'shorts-only': {
    name: 'Shorts Only',
    description: 'All bots open short positions to test negative OI',
    botCount: 5,
    tradesPerBlock: [2, 4],
    positionSize: [200, 1000],
    leverage: [5, 15],
    longShortRatio: 0.0, // All shorts
    strategyWeights: {
      random: 0.6,
      momentum: 0.4,
      'mean-reversion': 0.0,
      'flash-attack': 0.0,
    },
    blockAdvanceRate: 1,
  },

  'flash-attack': {
    name: 'Flash Attack',
    description: 'Extreme positions attempting to manipulate price',
    botCount: 2,
    tradesPerBlock: [1, 2],
    positionSize: [5000, 20000], // Massive positions
    leverage: [20, 30], // Maximum leverage
    longShortRatio: 0.5,
    strategyWeights: {
      random: 0.0,
      momentum: 0.0,
      'mean-reversion': 0.0,
      'flash-attack': 1.0, // Only flash attack strategy
    },
    blockAdvanceRate: 1,
  },
};

// Helper to pick random value in range
export function randomInRange(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

// Helper to pick random integer in range
export function randomIntInRange(min: number, max: number): number {
  return Math.floor(randomInRange(min, max));
}

// Helper to pick strategy based on weights
export function pickStrategy(weights: Record<StrategyType, number>): StrategyType {
  const totalWeight = Object.values(weights).reduce((sum, w) => sum + w, 0);
  let random = Math.random() * totalWeight;

  for (const [strategy, weight] of Object.entries(weights)) {
    random -= weight;
    if (random <= 0) {
      return strategy as StrategyType;
    }
  }

  return 'random'; // Fallback
}

// Helper to decide long vs short based on ratio
export function shouldGoLong(longShortRatio: number): boolean {
  return Math.random() < longShortRatio;
}
