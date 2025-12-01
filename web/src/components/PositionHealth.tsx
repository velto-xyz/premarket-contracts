import { formatUnits } from 'viem';
import { usePositionHealth } from '../hooks/usePositionHealth';

interface PositionHealthProps {
  positionId: bigint;
  margin: bigint;
  leverage: bigint;
}

export function PositionHealth({ positionId, margin, leverage }: PositionHealthProps) {
  const health = usePositionHealth(positionId);

  if (!health) {
    return <div className="position-health loading">Loading health...</div>;
  }

  const { healthRatio, totalPnl, isLiquidatable } = health;

  // Determine health status
  let healthStatus: 'healthy' | 'warning' | 'danger';
  if (healthRatio >= 50) {
    healthStatus = 'healthy';
  } else if (healthRatio >= 30) {
    healthStatus = 'warning';
  } else {
    healthStatus = 'danger';
  }

  // Calculate liquidation threshold based on leverage
  const leverageNum = Number(formatUnits(leverage, 18));
  let liqThreshold = 10; // 10% for low leverage
  if (leverageNum > 20) {
    liqThreshold = 30; // 30% for >20x
  } else if (leverageNum > 10) {
    liqThreshold = 20; // 20% for >10x
  }

  return (
    <div className={`position-health ${healthStatus}`}>
      <div className="health-header">
        <span className="health-label">Health</span>
        {isLiquidatable && (
          <span className="liquidatable-badge">⚠️ LIQUIDATABLE</span>
        )}
      </div>

      <div className="health-bar-container">
        <div
          className={`health-bar ${healthStatus}`}
          style={{ width: `${Math.min(healthRatio, 100)}%` }}
        />
        <div className="health-percentage">{healthRatio.toFixed(1)}%</div>
      </div>

      <div className="health-details">
        <div className="health-row">
          <span>PnL:</span>
          <span className={totalPnl >= 0n ? 'positive' : 'negative'}>
            {totalPnl >= 0n ? '+' : ''}
            {formatUnits(totalPnl, 18)} USDC
          </span>
        </div>
        <div className="health-row">
          <span>Liq. Threshold:</span>
          <span className="threshold">{liqThreshold}%</span>
        </div>
      </div>

      {healthRatio < 40 && (
        <div className="health-warning">
          ⚠️ Position at risk of liquidation
        </div>
      )}
    </div>
  );
}
