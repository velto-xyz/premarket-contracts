import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { useState, useEffect } from 'react';
import { useMarketStore } from '../store/marketStore';
import { usePositionStore } from '../store/positionStore';
import { PositionHealth } from './PositionHealth';
import { useSimulationStore } from '../simulation/store/simulationStore';
import { ABIS } from '../contract-api';
import { formatBigInt } from '../utils/format';

export function PositionList() {
  const { address, isConnected } = useAccount();
  const { selectedMarket } = useMarketStore();
  const { botWallets } = useSimulationStore();
  const { getUserPositions, positions: allPositions } = usePositionStore();
  const [closingPositionId, setClosingPositionId] = useState<bigint | null>(null);

  // Helper to check if an address belongs to a bot
  const isBotAddress = (addr: `0x${string}`): boolean => {
    return botWallets.some(bot => bot.address.toLowerCase() === addr.toLowerCase());
  };

  const { writeContract, data: closeHash } = useWriteContract();
  const { isLoading: isClosing } = useWaitForTransactionReceipt({ hash: closeHash });

  // Get user positions from store
  const userPositions = address ? getUserPositions(address) : [];

  // Get bot positions from store
  const botPositions = Object.values(allPositions).filter(pos =>
    isBotAddress(pos.user)
  );

  const handleClosePosition = (positionId: bigint) => {
    if (!selectedMarket) return;
    setClosingPositionId(positionId);
    writeContract({
      address: selectedMarket as `0x${string}`,
      abi: ABIS.PerpEngine,
      functionName: 'closePosition',
      args: [positionId],
    });
  };

  useEffect(() => {
    if (!isClosing) {
      setClosingPositionId(null);
    }
  }, [isClosing]);

  if (!selectedMarket) {
    return <div className="position-list">Select a market first</div>;
  }

  const hasSimulationRunning = botPositions.length > 0;
  const totalPositions = userPositions.length + botPositions.length;

  return (
    <div className="position-list">
      <h2>Open Positions</h2>

      {!isConnected && !hasSimulationRunning ? (
        <p className="no-positions">Connect wallet or start simulation to see positions</p>
      ) : totalPositions === 0 ? (
        <p className="no-positions">No open positions</p>
      ) : (
        <div className="positions">
          {isConnected && userPositions.length > 0 && (
            <div className="positions-section">
              <h3>Your Positions</h3>
              {userPositions.map((position) => (
                <div key={position.id.toString()} className="position-card">
                  <div className="position-header">
                    <span className={`position-side ${position.isLong ? 'long' : 'short'}`}>
                      {position.isLong ? 'LONG' : 'SHORT'}
                    </span>
                    <span className="position-id">#{position.id.toString()}</span>
                  </div>

                  <div className="position-details">
                    <div className="detail-row">
                      <span>Margin:</span>
                      <span>{formatBigInt(position.margin, 18, 2)} USDC</span>
                    </div>
                    <div className="detail-row">
                      <span>Leverage:</span>
                      <span>{formatBigInt(position.leverage, 18, 1)}x</span>
                    </div>
                    <div className="detail-row">
                      <span>Entry Price:</span>
                      <span>${formatBigInt(position.entryPrice, 18, 2)}</span>
                    </div>
                    <div className="detail-row">
                      <span>Size:</span>
                      <span>{formatBigInt(position.baseSize, 18, 4)}</span>
                    </div>
                  </div>

                  <PositionHealth
                    positionId={position.id}
                    margin={position.margin}
                    leverage={position.leverage}
                  />

                  <button
                    className="close-position-button"
                    onClick={() => handleClosePosition(position.id)}
                    disabled={isClosing && closingPositionId === position.id}
                  >
                    {isClosing && closingPositionId === position.id ? 'Closing...' : 'Close Position'}
                  </button>
                </div>
              ))}
            </div>
          )}

          {botPositions.length > 0 && (
            <div className="positions-section">
              <h3>Simulation Bot Positions ({botPositions.length})</h3>
              {botPositions.map((position) => (
                <div key={position.id.toString()} className="position-card bot-position">
                  <div className="position-header">
                    <span className={`position-side ${position.isLong ? 'long' : 'short'}`}>
                      {position.isLong ? 'LONG' : 'SHORT'}
                    </span>
                    <span className="bot-badge">BOT</span>
                    <span className="position-id">#{position.id.toString()}</span>
                  </div>

                  <div className="position-details">
                    <div className="detail-row">
                      <span>Margin:</span>
                      <span>{formatBigInt(position.margin, 18, 2)} USDC</span>
                    </div>
                    <div className="detail-row">
                      <span>Leverage:</span>
                      <span>{formatBigInt(position.leverage, 18, 1)}x</span>
                    </div>
                    <div className="detail-row">
                      <span>Entry Price:</span>
                      <span>${formatBigInt(position.entryPrice, 18, 2)}</span>
                    </div>
                    <div className="detail-row">
                      <span>Size:</span>
                      <span>{formatBigInt(position.baseSize, 18, 4)}</span>
                    </div>
                  </div>

                  <PositionHealth
                    positionId={position.id}
                    margin={position.margin}
                    leverage={position.leverage}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
