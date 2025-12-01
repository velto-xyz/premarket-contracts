import { TradingStrategy, type TradingDecision, type MarketState, type BotState } from './TradingStrategy';
import { formatUnits } from 'viem';

/**
 * MeanReversionStrategy: Counter-trend trading
 * - Long when price is below moving average (expecting reversion up)
 * - Short when price is above moving average (expecting reversion down)
 * - Close positions when price reaches MA
 */
export class MeanReversionStrategy extends TradingStrategy {
  readonly name = 'Mean Reversion';

  decide(
    marketState: MarketState,
    botState: BotState,
    scenarioParams: {
      positionSizeRange: [number, number];
      leverageRange: [number, number];
      longShortRatio: number;
    }
  ): TradingDecision {
    // Need price history for mean reversion
    if (marketState.priceHistory.length < 10) {
      return { action: 'hold' };
    }

    const currentPrice = Number(formatUnits(marketState.markPrice, 18));
    const ma = this.movingAverage(marketState.priceHistory, 10);

    const deviationPercent = ((currentPrice - ma) / ma) * 100;
    const significantDeviation = Math.abs(deviationPercent) > 2; // 2% threshold

    // Close positions randomly (would ideally check if near MA)
    if (botState.activePositions.length > 0 && Math.random() < 0.15) {
      const randomIndex = Math.floor(Math.random() * botState.activePositions.length);
      return {
        action: 'close',
        positionToClose: botState.activePositions[randomIndex],
      };
    }

    // Open mean reversion position if significant deviation
    if (botState.canTrade && significantDeviation) {
      // Long when below MA (expecting price to rise back)
      // Short when above MA (expecting price to fall back)
      let isLong: boolean;

      if (scenarioParams.longShortRatio === 1.0) {
        isLong = true; // Force long
      } else if (scenarioParams.longShortRatio === 0.0) {
        isLong = false; // Force short
      } else {
        isLong = currentPrice < ma; // Counter-trend
      }

      const size = this.randomIntInRange(...scenarioParams.positionSizeRange);
      const leverage = this.randomIntInRange(...scenarioParams.leverageRange);

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
