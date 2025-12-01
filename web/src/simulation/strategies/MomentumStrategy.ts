import { TradingStrategy, type TradingDecision, type MarketState, type BotState } from './TradingStrategy';
import { formatUnits } from 'viem';

/**
 * MomentumStrategy: Follow price trends
 * - Long when price is rising (above short-term MA)
 * - Short when price is falling (below short-term MA)
 * - Close positions when trend reverses
 */
export class MomentumStrategy extends TradingStrategy {
  readonly name = 'Momentum';

  decide(
    marketState: MarketState,
    botState: BotState,
    scenarioParams: {
      positionSizeRange: [number, number];
      leverageRange: [number, number];
      longShortRatio: number;
    }
  ): TradingDecision {
    // Need price history for momentum
    if (marketState.priceHistory.length < 5) {
      return { action: 'hold' };
    }

    const currentPrice = Number(formatUnits(marketState.markPrice, 18));
    const shortMA = this.movingAverage(marketState.priceHistory, 5);
    const longMA = this.movingAverage(marketState.priceHistory, 10);

    const isUptrend = currentPrice > shortMA && shortMA > longMA;
    const isDowntrend = currentPrice < shortMA && shortMA < longMA;

    // Check if we should close existing positions against trend
    if (botState.activePositions.length > 0) {
      // TODO: Would need position details to know if long/short
      // For now, close 20% of the time to avoid accumulating too many positions
      if (Math.random() < 0.2) {
        const randomIndex = Math.floor(Math.random() * botState.activePositions.length);
        return {
          action: 'close',
          positionToClose: botState.activePositions[randomIndex],
        };
      }
    }

    // Open position following momentum
    if (botState.canTrade && (isUptrend || isDowntrend)) {
      // Respect scenario's long/short ratio override
      let isLong: boolean;
      if (scenarioParams.longShortRatio === 1.0) {
        isLong = true; // Force long
      } else if (scenarioParams.longShortRatio === 0.0) {
        isLong = false; // Force short
      } else {
        isLong = isUptrend; // Follow momentum
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
