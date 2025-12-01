import { TradingStrategy, type TradingDecision, type MarketState, type BotState } from './TradingStrategy';

/**
 * FlashAttackStrategy: Extreme positions to manipulate price
 * - Opens maximum size positions with max leverage
 * - Alternates between long and short to whipsaw price
 * - Closes positions quickly to realize manipulation profits
 * - High risk of liquidation but tests system limits
 */
export class FlashAttackStrategy extends TradingStrategy {
  readonly name = 'Flash Attack';

  private lastAction: 'long' | 'short' | null = null;

  decide(
    _marketState: MarketState,
    botState: BotState,
    scenarioParams: {
      positionSizeRange: [number, number];
      leverageRange: [number, number];
      longShortRatio: number;
    }
  ): TradingDecision {
    // Close existing positions aggressively (50% chance per position)
    if (botState.activePositions.length > 0 && Math.random() < 0.5) {
      const randomIndex = Math.floor(Math.random() * botState.activePositions.length);
      return {
        action: 'close',
        positionToClose: botState.activePositions[randomIndex],
      };
    }

    // Open extreme positions (70% chance to be aggressive)
    if (botState.canTrade && Math.random() < 0.7) {
      // Alternate sides to whipsaw the price
      const isLong = this.lastAction === 'short' || this.lastAction === null;
      this.lastAction = isLong ? 'long' : 'short';

      // Use maximum values from range
      const size = scenarioParams.positionSizeRange[1]; // Max size
      const leverage = scenarioParams.leverageRange[1]; // Max leverage

      return {
        action: 'open',
        isLong,
        size,
        leverage,
      };
    }

    return { action: 'hold' };
  }
}
