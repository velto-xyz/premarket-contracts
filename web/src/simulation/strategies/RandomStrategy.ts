import { TradingStrategy, type TradingDecision, type MarketState, type BotState } from './TradingStrategy';

/**
 * RandomStrategy: Completely random trading decisions
 * - Random long/short based on scenario's longShortRatio
 * - Random size within bounds
 * - Random leverage within bounds
 * - Random chance to close existing positions
 */
export class RandomStrategy extends TradingStrategy {
  readonly name = 'Random';

  decide(
    _marketState: MarketState,
    botState: BotState,
    scenarioParams: {
      positionSizeRange: [number, number];
      leverageRange: [number, number];
      longShortRatio: number;
    }
  ): TradingDecision {
    // 30% chance to close a random position if we have any
    if (botState.activePositions.length > 0 && Math.random() < 0.3) {
      const randomIndex = Math.floor(Math.random() * botState.activePositions.length);
      return {
        action: 'close',
        positionToClose: botState.activePositions[randomIndex],
      };
    }

    // 50% chance to open new position
    if (Math.random() < 0.5 && botState.canTrade) {
      const isLong = Math.random() < scenarioParams.longShortRatio;
      const size = this.randomIntInRange(...scenarioParams.positionSizeRange);
      const leverage = this.randomIntInRange(...scenarioParams.leverageRange);

      return {
        action: 'open',
        isLong,
        size,
        leverage,
      };
    }

    // Hold
    return { action: 'hold' };
  }
}
