import { useReadContract } from 'wagmi';
import { useMarketStore } from '../store/marketStore';
import { ABIS } from '../contract-api';

interface PositionHealth {
  markPrice: bigint;
  notionalNow: bigint;
  pnlTrade: bigint;
  carryPnl: bigint;
  totalPnl: bigint;
  equityIfClosed: bigint;
  isLiquidatable: boolean;
  healthRatio: number; // 0-100 percentage
}

export function usePositionHealth(positionId: bigint | null): PositionHealth | null {
  const { selectedMarket } = useMarketStore();

  // Get PositionManager address
  const { data: positionManagerAddress } = useReadContract({
    address: selectedMarket as `0x${string}`,
    abi: ABIS.PerpEngine,
    functionName: 'positionManager',
  });

  // Get LiquidationEngine address
  const { data: liquidationEngineAddress } = useReadContract({
    address: selectedMarket as `0x${string}`,
    abi: ABIS.PerpEngine,
    functionName: 'liquidationEngine',
  });

  // Get position data
  const { data: position } = useReadContract({
    address: positionManagerAddress as `0x${string}`,
    abi: ABIS.PositionManager,
    functionName: 'getPosition',
    args: positionId ? [positionId] : undefined,
  });

  // Get health metrics
  const { data: healthData } = useReadContract({
    address: liquidationEngineAddress as `0x${string}`,
    abi: ABIS.LiquidationEngine,
    functionName: 'getPositionHealth',
    args: positionId ? [positionId] : undefined,
  });

  // Check if liquidatable
  const { data: isLiquidatable } = useReadContract({
    address: liquidationEngineAddress as `0x${string}`,
    abi: ABIS.LiquidationEngine,
    functionName: 'isLiquidatable',
    args: positionId ? [positionId] : undefined,
  });

  if (!healthData || !position) return null;

  const [markPrice, notionalNow, pnlTrade, carryPnl, totalPnl, equityIfClosed] = healthData;

  // Calculate health ratio (equity / margin)
  // 100% = healthy, <20% = liquidatable for high leverage
  const margin = position.margin;
  const equity = equityIfClosed;

  let healthRatio = 100;
  if (margin > 0n) {
    // Convert to percentage: (equity / margin) * 100
    // Handle negative equity
    if (equity <= 0n) {
      healthRatio = 0;
    } else {
      healthRatio = Number((equity * 100n) / margin);
    }
  }

  return {
    markPrice,
    notionalNow,
    pnlTrade,
    carryPnl,
    totalPnl,
    equityIfClosed,
    isLiquidatable: isLiquidatable || false,
    healthRatio,
  };
}
