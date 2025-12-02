import { useMarketStore } from '../store/marketStore';
import { useTradeStore } from '../store/tradeStore';
import { useSimulationStore } from '../simulation/store/simulationStore';
import { formatBigInt, formatBigIntUSD, formatAddress, formatTimeAgo } from '../utils/format';

export function TradeFeed() {
  const { selectedMarket } = useMarketStore();
  const { botWallets } = useSimulationStore();
  const { trades } = useTradeStore();

  const isBotAddress = (addr: `0x${string}`): boolean => {
    return botWallets.some(bot => bot.address.toLowerCase() === addr.toLowerCase());
  };

  if (!selectedMarket) {
    console.log('TradeFeed: No market selected');
    return (
      <div className="trade-feed">
        <h3>Trade Feed</h3>
        <p className="no-trades">Select a market to view trades</p>
      </div>
    );
  }

  return (
    <div className="trade-feed">
      <h3>Live Trade Feed</h3>

      {trades.length === 0 ? (
        <p className="no-trades">No trades yet. Start simulation to see activity.</p>
      ) : (
        <div className="trade-list">
          {trades.map((trade) => (
            <div
              key={trade.id}
              className={`trade-item ${trade.type} ${isBotAddress(trade.user) ? 'bot-trade' : ''}`}
            >
              <div className="trade-header">
                <span className={`trade-type-badge ${trade.type}`}>
                  {trade.type === 'open' && '📈 OPEN'}
                  {trade.type === 'close' && '📉 CLOSE'}
                  {trade.type === 'liquidation' && '⚠️ LIQUIDATED'}
                </span>
                {isBotAddress(trade.user) && <span className="bot-badge">BOT</span>}
                <span className="trade-time">{formatTimeAgo(trade.timestamp)}</span>
              </div>

              <div className="trade-details">
                <div className="detail-row">
                  <span>Position #{trade.positionId.toString()}</span>
                </div>
                <div className="detail-row">
                  <span className="label">Trader:</span>
                  <span>{formatAddress(trade.user)}</span>
                </div>

                {trade.type === 'open' && (
                  <>
                    <div className="detail-row">
                      <span className="label">Side:</span>
                      <span className={trade.isLong ? 'long' : 'short'}>
                        {trade.isLong ? 'LONG' : 'SHORT'}
                      </span>
                    </div>
                    <div className="detail-row">
                      <span className="label">Entry:</span>
                      <span>{formatBigIntUSD(trade.entryPrice || 0n, 18)}</span>
                    </div>
                    <div className="detail-row">
                      <span className="label">Margin:</span>
                      <span>{formatBigInt(trade.margin || 0n, 18, 2)} USDC</span>
                    </div>
                    <div className="detail-row">
                      <span className="label">Leverage:</span>
                      <span>{formatBigInt(trade.leverage || 0n, 18, 1)}x</span>
                    </div>
                  </>
                )}

                {trade.type === 'close' && trade.totalPnl !== undefined && (
                  <>
                    <div className="detail-row">
                      <span className="label">Exit:</span>
                      <span>{formatBigIntUSD(trade.avgClosePrice || 0n, 18)}</span>
                    </div>
                    <div className="detail-row">
                      <span className="label">PnL:</span>
                      <span className={trade.totalPnl >= 0n ? 'profit' : 'loss'}>
                        {trade.totalPnl >= 0n ? '+' : ''}
                        {formatBigInt(trade.totalPnl, 18, 2)} USDC
                      </span>
                    </div>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
