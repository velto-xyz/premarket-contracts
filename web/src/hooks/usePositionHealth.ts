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
    query: { enabled: !!selectedMarket },
  });

  // Get PerpMarket address
  const { data: marketAddress } = useReadContract({
    address: selectedMarket as `0x${string}`,
    abi: ABIS.PerpEngine,
    functionName: 'market',
    query: { enabled: !!selectedMarket },
  });

  // Get LiquidationEngine address
  const { data: liquidationEngineAddress } = useReadContract({
    address: selectedMarket as `0x${string}`,
    abi: ABIS.PerpEngine,
    functionName: 'liquidationEngine',
    query: { enabled: !!selectedMarket },
  });

  // Get position data
  const { data: position } = useReadContract({
    address: positionManagerAddress as `0x${string}`,
    abi: ABIS.PositionManager,
    functionName: 'getPosition',
    args: positionId ? [positionId] : undefined,
    query: { enabled: !!positionManagerAddress && !!positionId },
  });

  // Get health metrics from simulateEquityIfClosed
  const { data: healthData } = useReadContract({
    address: positionManagerAddress as `0x${string}`,
    abi: ABIS.PositionManager,
    functionName: 'simulateEquityIfClosed',
    args: positionId ? [positionId] : undefined,
    query: { enabled: !!positionManagerAddress && !!positionId },
  });

  // Get mark price from market
  const { data: markPrice } = useReadContract({
    address: marketAddress as `0x${string}`,
    abi: ABIS.PerpMarket,
    functionName: 'getMarkPrice',
    query: { enabled: !!marketAddress },
  });

  // Check if liquidatable (requires all three addresses)
  const { data: isLiquidatableResult } = useReadContract({
    address: liquidationEngineAddress as `0x${string}`,
    abi: ABIS.LiquidationEngine,
    functionName: 'isLiquidatable',
    args: positionManagerAddress && marketAddress && positionId
      ? [positionManagerAddress, marketAddress, positionId]
      : undefined,
    query: {
      enabled: !!liquidationEngineAddress && !!positionManagerAddress && !!marketAddress && !!positionId
    },
  });

  if (!healthData || !position || !markPrice) return null;

  // healthData from simulateEquityIfClosed returns:
  // [closeNotional, avgClosePrice, pnlTrade, carryPnl, totalPnl, equityIfClosed]
  const [closeNotional, avgClosePrice, pnlTrade, carryPnl, totalPnl, equityIfClosed] = healthData as readonly [
    bigint, bigint, bigint, bigint, bigint, bigint
  ];

  // Calculate notionalNow = baseSize * markPrice / PRECISION
  const notionalNow = (position.baseSize * markPrice) / 1_000_000_000_000_000_000n;

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
    isLiquidatable: isLiquidatableResult || false,
    healthRatio,
  };
}
