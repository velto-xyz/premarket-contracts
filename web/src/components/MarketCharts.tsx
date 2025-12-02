import { useState, useEffect } from 'react';
import { type LineData, type UTCTimestamp } from 'lightweight-charts';
import { useMarketData } from '../hooks/useMarketData';
import { LineChart } from './charts/LineChart';
import { formatBigInt, formatCompact } from '../utils/format';

const MAX_DATA_POINTS = 100; // Keep last 100 data points

export function MarketCharts() {
  const marketData = useMarketData(2000); // Refresh every 2 seconds

  // Store historical data
  const [priceHistory, setPriceHistory] = useState<LineData[]>([]);
  const [baseReserveHistory, setBaseReserveHistory] = useState<LineData[]>([]);
  const [quoteReserveHistory, setQuoteReserveHistory] = useState<LineData[]>([]);
  const [longOIHistory, setLongOIHistory] = useState<LineData[]>([]);
  const [shortOIHistory, setShortOIHistory] = useState<LineData[]>([]);
  const [carryHistory, setCarryHistory] = useState<LineData[]>([]);

  // Update historical data when new market data arrives
  useEffect(() => {
    if (!marketData) return;

    const timestamp = marketData.timestamp / 1000 as UTCTimestamp;

    // Add new data points (skip duplicates)
    const addDataPoint = (
      setter: React.Dispatch<React.SetStateAction<LineData[]>>,
      value: number
    ) => {
      setter((prev) => {
        // Skip if timestamp already exists
        if (prev.length > 0 && prev[prev.length - 1].time === timestamp) {
          return prev;
        }
        const newData = [...prev, { time: timestamp, value }];
        // Keep only last MAX_DATA_POINTS
        return newData.slice(-MAX_DATA_POINTS);
      });
    };

    // Convert BigInt to number for chart (avoid precision loss by dividing first)
    const toChartNumber = (value: bigint): number => {
      return Number(value) / 1e18;
    };

    // Mark Price
    addDataPoint(setPriceHistory, toChartNumber(marketData.markPrice));

    // Reserves
    addDataPoint(setBaseReserveHistory, toChartNumber(marketData.baseReserve));
    addDataPoint(setQuoteReserveHistory, toChartNumber(marketData.quoteReserve));

    // Open Interest
    addDataPoint(setLongOIHistory, toChartNumber(marketData.longOI));
    addDataPoint(setShortOIHistory, toChartNumber(marketData.shortOI));

    // Carry Index
    addDataPoint(setCarryHistory, toChartNumber(marketData.carryIndex));
  }, [marketData]);

  if (!marketData) {
    return (
      <div className="market-charts">
        <h2>Market Charts</h2>
        <p className="loading-charts">⚠️ No market data available</p>
      </div>
    );
  }

  return (
    <div className="market-charts">
      <h2>Market Data</h2>

      {/* Current Stats */}
      <div className="market-stats">
        <div className="stat-card">
          <div className="stat-label">Mark Price</div>
          <div className="stat-value">{formatBigInt(marketData.markPrice, 18, 2)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Long OI</div>
          <div className="stat-value positive">{formatCompact(Number(marketData.longOI) / 1e18)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Short OI</div>
          <div className="stat-value negative">{formatCompact(Number(marketData.shortOI) / 1e18)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Net OI</div>
          <div className={`stat-value ${marketData.netOI >= 0n ? 'positive' : 'negative'}`}>
            {marketData.netOI >= 0n ? '+' : ''}
            {formatCompact(Number(marketData.netOI) / 1e18)}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Insurance Fund</div>
          <div className="stat-value">{formatCompact(Number(marketData.insuranceFund) / 1e18)} USDC</div>
        </div>
      </div>

      {/* Charts Grid */}
      <div className="charts-grid">
        <LineChart
          data={priceHistory}
          title="Mark Price"
          color="#2563eb"
          height={180}
        />

        <LineChart
          data={baseReserveHistory}
          title="Base Reserve"
          color="#10b981"
          height={180}
        />

        <LineChart
          data={quoteReserveHistory}
          title="Quote Reserve (USDC)"
          color="#8b5cf6"
          height={180}
        />

        <LineChart
          data={longOIHistory}
          title="Long Open Interest"
          color="#10b981"
          height={180}
        />

        <LineChart
          data={shortOIHistory}
          title="Short Open Interest"
          color="#ef4444"
          height={180}
        />

        <LineChart
          data={carryHistory}
          title="Cumulative Carry Index"
          color="#f59e0b"
          height={180}
        />
      </div>
    </div>
  );
}
