import { useState } from 'react';
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract } from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useMarketStore } from '../store/marketStore';
import { ABIS } from '../contract-api';
import { formatBigInt } from '../utils/format';

interface LiquidatablePosition {
  id: bigint;
  user: string;
  isLong: boolean;
  margin: bigint;
  entryNotional: bigint;
}

export function LiquidationPanel() {
  const { isConnected } = useAccount();
  const { selectedMarket } = useMarketStore();
  const [liquidatablePositions, setLiquidatablePositions] = useState<LiquidatablePosition[]>([]);
  const [scanning, setScanning] = useState(false);
  const [liquidatingId, setLiquidatingId] = useState<bigint | null>(null);

  const { writeContract, data: liquidateHash } = useWriteContract();
  const { isLoading: isLiquidating } = useWaitForTransactionReceipt({ hash: liquidateHash });

  // Get contract addresses
  const { data: positionManagerAddress } = useReadContract({
    address: selectedMarket as `0x${string}`,
    abi: ABIS.PerpEngine,
    functionName: 'positionManager',
  });

  const { data: liquidationEngineAddress } = useReadContract({
    address: selectedMarket as `0x${string}`,
    abi: ABIS.PerpEngine,
    functionName: 'liquidationEngine',
  });

  const { data: nextPositionId } = useReadContract({
    address: positionManagerAddress as `0x${string}`,
    abi: ABIS.PositionManager,
    functionName: 'nextPositionId',
  });

  const { data: liqFeeRatio } = useReadContract({
    address: liquidationEngineAddress as `0x${string}`,
    abi: ABIS.LiquidationEngine,
    functionName: 'LIQUIDATION_FEE_RATIO',
  });

  const scanForLiquidations = async () => {
    if (!nextPositionId || !positionManagerAddress || !liquidationEngineAddress) return;

    setScanning(true);
    const liquidatable: LiquidatablePosition[] = [];

    // Scan all positions (in a real app, you'd use events or subgraph)
    for (let i = 1n; i < nextPositionId; i++) {
      try {
        // This is simplified - in reality you'd batch these calls
        const position = await window.ethereum?.request({
          method: 'eth_call',
          params: [{
            to: positionManagerAddress,
            data: `0x46d5c678${i.toString(16).padStart(64, '0')}`, // getPosition(uint256)
          }, 'latest'],
        });

        // Check if liquidatable
        const isLiq = await window.ethereum?.request({
          method: 'eth_call',
          params: [{
            to: liquidationEngineAddress,
            data: `0x91c3ddca${i.toString(16).padStart(64, '0')}`, // isLiquidatable(uint256)
          }, 'latest'],
        });

        if (isLiq && isLiq !== '0x0000000000000000000000000000000000000000000000000000000000000000') {
          // Position is liquidatable - add to list
          // For demo, we'll just add position ID
          liquidatable.push({
            id: i,
            user: '0x...',
            isLong: true,
            margin: 0n,
            entryNotional: 0n,
          });
        }
      } catch (error) {
        console.error(`Error checking position ${i}:`, error);
      }
    }

    setLiquidatablePositions(liquidatable);
    setScanning(false);
  };

  const handleLiquidate = (positionId: bigint) => {
    if (!selectedMarket) return;
    setLiquidatingId(positionId);
    writeContract({
      address: selectedMarket as `0x${string}`,
      abi: ABIS.PerpEngine,
      functionName: 'liquidate',
      args: [positionId],
    });
  };

  if (!selectedMarket) {
    return (
      <div className="liquidation-panel">
        <h3>Liquidations</h3>
        <p>Select a market first</p>
      </div>
    );
  }

  return (
    <div className="liquidation-panel">
      <div className="liquidation-header">
        <h3>Liquidation Bot</h3>
        <button
          className="scan-button"
          onClick={scanForLiquidations}
          disabled={scanning}
        >
          {scanning ? 'Scanning...' : 'Scan Positions'}
        </button>
      </div>

      <div className="liquidation-info">
        <div className="info-row">
          <span>Liquidation Fee:</span>
          <span>{liqFeeRatio ? formatBigInt(liqFeeRatio, 18, 1) : '0.5'}%</span>
        </div>
        <div className="info-row">
          <span>Total Positions:</span>
          <span>{nextPositionId ? (nextPositionId - 1n).toString() : '0'}</span>
        </div>
      </div>

      {liquidatablePositions.length === 0 ? (
        <div className="no-liquidations">
          <p>No liquidatable positions found</p>
          <p className="hint">Positions become liquidatable when health falls below threshold</p>
        </div>
      ) : (
        <div className="liquidatable-list">
          <h4>Liquidatable Positions ({liquidatablePositions.length})</h4>
          {liquidatablePositions.map((position) => (
            <div key={position.id.toString()} className="liquidatable-card">
              <div className="liquidatable-header">
                <span className="position-id">Position #{position.id.toString()}</span>
                <span className={`side-badge ${position.isLong ? 'long' : 'short'}`}>
                  {position.isLong ? 'LONG' : 'SHORT'}
                </span>
              </div>

              {!isConnected ? (
                <div className="connect-to-liquidate">
                  <p>Connect to liquidate</p>
                  <ConnectButton />
                </div>
              ) : (
                <button
                  className="liquidate-button"
                  onClick={() => handleLiquidate(position.id)}
                  disabled={isLiquidating && liquidatingId === position.id}
                >
                  {isLiquidating && liquidatingId === position.id
                    ? 'Liquidating...'
                    : 'Liquidate & Earn Fee'}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
