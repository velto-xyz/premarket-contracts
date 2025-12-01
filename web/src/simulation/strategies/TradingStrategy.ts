/**
 * Base interface for trading strategies
 */
export interface TradingDecision {
  action: 'open' | 'close' | 'hold';
  isLong?: boolean;
  size?: number; // USDC amount
  leverage?: number; // Multiplier
  positionToClose?: bigint; // Position ID to close
}

export interface MarketState {
  markPrice: bigint;
  baseReserve: bigint;
  quoteReserve: bigint;
  longOI: bigint;
  shortOI: bigint;
  priceHistory: number[]; // Last N prices for moving average
}

export interface BotState {
  address: `0x${string}`;
  balance: bigint;
  activePositions: bigint[];
  canTrade: boolean; // Cooldown or other restrictions
}

export abstract class TradingStrategy {
  abstract readonly name: string;

  /**
   * Decide what action to take given current market and bot state
   */
  abstract decide(
    marketState: MarketState,
    botState: BotState,
    scenarioParams: {
      positionSizeRange: [number, number];
      leverageRange: [number, number];
      longShortRatio: number;
    }
  ): TradingDecision;

  /**
   * Helper: Calculate moving average
   */
  protected movingAverage(prices: number[], period: number): number {
    const slice = prices.slice(-period);
    if (slice.length === 0) return 0;
    return slice.reduce((sum, p) => sum + p, 0) / slice.length;
  }

  /**
   * Helper: Random value in range
   */
  protected randomInRange(min: number, max: number): number {
    return Math.random() * (max - min) + min;
  }

  /**
   * Helper: Random int in range
   */
  protected randomIntInRange(min: number, max: number): number {
    return Math.floor(this.randomInRange(min, max));
  }
}
