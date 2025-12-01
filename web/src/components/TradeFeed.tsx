import { useWatchContractEvent } from 'wagmi';
import { useState, useEffect } from 'react';
import { formatUnits } from 'viem';
import { useMarketStore } from '../store/marketStore';
import { useSimulationStore } from '../simulation/store/simulationStore';

// Placeholder ABIs
const ENGINE_ABI = [
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: 'positionId', type: 'uint256' },
      { indexed: true, name: 'user', type: 'address' },
      { indexed: true, name: 'isLong', type: 'bool' },
      { indexed: false, name: 'totalToUse', type: 'uint256' },
      { indexed: false, name: 'margin', type: 'uint256' },
      { indexed: false, name: 'fee', type: 'uint256' },
      { indexed: false, name: 'leverage', type: 'uint256' },
      { indexed: false, name: 'baseSize', type: 'uint256' },
      { indexed: false, name: 'entryPrice', type: 'uint256' },
    ],
    name: 'PositionOpened',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: 'positionId', type: 'uint256' },
      { indexed: true, name: 'user', type: 'address' },
      { indexed: false, name: 'totalPnl', type: 'int256' },
      { indexed: false, name: 'avgClosePrice', type: 'uint256' },
    ],
    name: 'PositionClosed',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: 'positionId', type: 'uint256' },
      { indexed: true, name: 'liquidator', type: 'address' },
      { indexed: false, name: 'user', type: 'address' },
      { indexed: false, name: 'liquidatorReward', type: 'uint256' },
    ],
    name: 'PositionLiquidated',
    type: 'event',
  },
] as const;

interface TradeEvent {
  id: string;
  type: 'open' | 'close' | 'liquidation';
  timestamp: number;
  positionId: bigint;
  user: `0x${string}`;
  isLong?: boolean;
  margin?: bigint;
  leverage?: bigint;
  entryPrice?: bigint;
  pnl?: bigint;
  closePrice?: bigint;
  isBot: boolean;
}

export function TradeFeed() {
  const { selectedMarket } = useMarketStore();
  const { botWallets } = useSimulationStore();
  const [trades, setTrades] = useState<TradeEvent[]>([]);
  const [maxTrades] = useState(50); // Keep last 50 trades

  // Debug logs
  console.log('TradeFeed: selectedMarket:', selectedMarket);
  console.log('TradeFeed: botWallets:', botWallets);

  const isBotAddress = (addr: `0x${string}`): boolean => {
    return botWallets.some(bot => bot.address.toLowerCase() === addr.toLowerCase());
  };

  // Listen for PositionOpened events
  useWatchContractEvent({
    address: selectedMarket as `0x${string}`,
    abi: ENGINE_ABI,
    eventName: 'PositionOpened',
    onLogs(logs) {
      console.log('PositionOpened event received:', logs);
      
      // Debug log the first log's args to see the structure
      if (logs.length > 0) {
        console.log('First log args:', logs[0].args);
        console.log('First log transaction hash:', logs[0].transactionHash);
      }
      
      const newTrades = logs.map((log) => {
        const args = log.args as any; // Temporary type assertion to access properties
        
        // Debug log the args we're trying to access
        console.log('Processing PositionOpened:', {
          positionId: args.positionId?.toString(),
          user: args.user,
          isLong: args.isLong,
          margin: args.margin?.toString(),
          leverage: args.leverage?.toString(),
          entryPrice: args.entryPrice?.toString()
        });
        
        return {
          id: `open-${args.positionId?.toString()}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          type: 'open' as const,
          timestamp: Date.now(),
          positionId: args.positionId || 0n,
          user: args.user || '0x0000000000000000000000000000000000000000',
          isLong: args.isLong || false,
          margin: args.margin || 0n,
          leverage: args.leverage || 0n,
          entryPrice: args.entryPrice || 0n,
          isBot: args.user ? isBotAddress(args.user) : false,
        };
      });

      console.log('New trades to be added:', newTrades);
      setTrades((prev) => {
        const updated = [...newTrades, ...prev].slice(0, maxTrades);
        console.log('Updated trades:', updated);
        return updated;
      });
    },
  });

  // Listen for PositionClosed events
  useWatchContractEvent({
    address: selectedMarket as `0x${string}`,
    abi: ENGINE_ABI,
    eventName: 'PositionClosed',
    onLogs(logs) {
      console.log('PositionClosed event received:', logs);
      
      const newTrades = logs.map((log) => {
        const args = log.args as any;
        console.log('Processing PositionClosed:', {
          positionId: args.positionId?.toString(),
          user: args.user,
          totalPnl: args.totalPnl?.toString(),
          avgClosePrice: args.avgClosePrice?.toString()
        });
        
        return {
          id: `close-${args.positionId?.toString()}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          type: 'close' as const,
          timestamp: Date.now(),
          positionId: args.positionId || 0n,
          user: args.user || '0x0000000000000000000000000000000000000000',
          pnl: args.totalPnl || 0n,
          closePrice: args.avgClosePrice || 0n,
          isBot: args.user ? isBotAddress(args.user) : false,
        };
      });

      setTrades((prev) => [...newTrades, ...prev].slice(0, maxTrades));
    },
  });

  // Listen for Liquidation events
  useWatchContractEvent({
    address: selectedMarket as `0x${string}`,
    abi: ENGINE_ABI,
    eventName: 'PositionLiquidated',
    onLogs(logs) {
      console.log('PositionLiquidated event received:', logs);
      
      const newTrades = logs.map((log) => {
        const args = log.args as any;
        console.log('Processing PositionLiquidated:', {
          positionId: args.positionId?.toString(),
          user: args.user,
          liquidator: args.liquidator
        });
        
        return {
          id: `liq-${args.positionId?.toString()}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          type: 'liquidation' as const,
          timestamp: Date.now(),
          positionId: args.positionId || 0n,
          user: args.user || '0x0000000000000000000000000000000000000000',
          isBot: args.user ? isBotAddress(args.user) : false,
        };
      });

      setTrades((prev) => [...newTrades, ...prev].slice(0, maxTrades));
    },
  });

  const formatTime = (timestamp: number): string => {
    const now = Date.now();
    const diff = Math.floor((now - timestamp) / 1000);
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    return `${Math.floor(diff / 3600)}h ago`;
  };

  const formatAddress = (addr: `0x${string}`): string => {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
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
              className={`trade-item ${trade.type} ${trade.isBot ? 'bot-trade' : ''}`}
            >
              <div className="trade-header">
                <span className={`trade-type-badge ${trade.type}`}>
                  {trade.type === 'open' && '📈 OPEN'}
                  {trade.type === 'close' && '📉 CLOSE'}
                  {trade.type === 'liquidation' && '⚠️ LIQUIDATED'}
                </span>
                {trade.isBot && <span className="bot-badge">BOT</span>}
                <span className="trade-time">{formatTime(trade.timestamp)}</span>
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
                      <span>${formatUnits(trade.entryPrice || 0n, 18)}</span>
                    </div>
                    <div className="detail-row">
                      <span className="label">Margin:</span>
                      <span>{formatUnits(trade.margin || 0n, 18)} USDC</span>
                    </div>
                    <div className="detail-row">
                      <span className="label">Leverage:</span>
                      <span>{formatUnits(trade.leverage || 0n, 18)}x</span>
                    </div>
                  </>
                )}

                {trade.type === 'close' && trade.pnl !== undefined && (
                  <>
                    <div className="detail-row">
                      <span className="label">Exit:</span>
                      <span>${formatUnits(trade.closePrice || 0n, 18)}</span>
                    </div>
                    <div className="detail-row">
                      <span className="label">PnL:</span>
                      <span className={Number(trade.pnl) >= 0 ? 'profit' : 'loss'}>
                        {Number(trade.pnl) >= 0 ? '+' : ''}
                        {formatUnits(trade.pnl, 18)} USDC
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
