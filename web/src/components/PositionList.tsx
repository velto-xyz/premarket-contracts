import { useAccount, useWriteContract, useWaitForTransactionReceipt, useWatchContractEvent } from 'wagmi';
import { useState, useEffect } from 'react';
import { formatUnits } from 'viem';
import { useMarketStore } from '../store/marketStore';
import { PositionHealth } from './PositionHealth';
import { useSimulationStore } from '../simulation/store/simulationStore';
import { ABIS } from '../contract-api';

interface Position {
  id: bigint;
  isLong: boolean;
  margin: bigint;
  leverage: bigint;
  entryPrice: bigint;
  baseSize: bigint;
  user: `0x${string}`;
}

export function PositionList() {
  const { address, isConnected } = useAccount();
  const { selectedMarket } = useMarketStore();
  const { botWallets } = useSimulationStore();
  const [positions, setPositions] = useState<Position[]>([]);
  const [closingPositionId, setClosingPositionId] = useState<bigint | null>(null);

  // Helper to check if an address belongs to a bot
  const isBotAddress = (addr: `0x${string}`): boolean => {
    return botWallets.some(bot => bot.address.toLowerCase() === addr.toLowerCase());
  };

  const { writeContract, data: closeHash } = useWriteContract();
  const { isLoading: isClosing } = useWaitForTransactionReceipt({ hash: closeHash });

  // Listen for PositionOpened events
  useWatchContractEvent({
    address: selectedMarket as `0x${string}`,
    abi: ABIS.PerpEngine,
    eventName: 'PositionOpened',
    onLogs(logs) {
      logs.forEach((log) => {
        const userAddr = log.args.user!;
        const isBot = isBotAddress(userAddr);
        // Show user's positions AND bot positions during simulation
        if (userAddr === address || isBot) {
          const newPosition: Position = {
            id: log.args.positionId!,
            isLong: log.args.isLong!,
            margin: log.args.margin!,
            leverage: log.args.leverage!,
            entryPrice: log.args.entryPrice!,
            baseSize: log.args.baseSize!,
            user: userAddr,
          };
          setPositions((prev) => [...prev, newPosition]);
        }
      });
    },
  });

  // Listen for PositionClosed events
  useWatchContractEvent({
    address: selectedMarket as `0x${string}`,
    abi: ABIS.PerpEngine,
    eventName: 'PositionClosed',
    onLogs(logs) {
      logs.forEach((log) => {
        const userAddr = log.args.user!;
        // Remove closed positions from user or bots
        if (userAddr === address || isBotAddress(userAddr)) {
          setPositions((prev) => prev.filter((p) => p.id !== log.args.positionId));
        }
      });
    },
  });

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

  const userPositions = positions.filter(p => p.user === address);
  const botPositions = positions.filter(p => isBotAddress(p.user));
  const hasSimulationRunning = botPositions.length > 0;

  return (
    <div className="position-list">
      <h2>Open Positions</h2>

      {!isConnected && !hasSimulationRunning ? (
        <p className="no-positions">Connect wallet or start simulation to see positions</p>
      ) : positions.length === 0 ? (
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
                      <span>{formatUnits(position.margin, 18)} USDC</span>
                    </div>
                    <div className="detail-row">
                      <span>Leverage:</span>
                      <span>{formatUnits(position.leverage, 18)}x</span>
                    </div>
                    <div className="detail-row">
                      <span>Entry Price:</span>
                      <span>${formatUnits(position.entryPrice, 18)}</span>
                    </div>
                    <div className="detail-row">
                      <span>Size:</span>
                      <span>{formatUnits(position.baseSize, 18)}</span>
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
                      <span>{formatUnits(position.margin, 18)} USDC</span>
                    </div>
                    <div className="detail-row">
                      <span>Leverage:</span>
                      <span>{formatUnits(position.leverage, 18)}x</span>
                    </div>
                    <div className="detail-row">
                      <span>Entry Price:</span>
                      <span>${formatUnits(position.entryPrice, 18)}</span>
                    </div>
                    <div className="detail-row">
                      <span>Size:</span>
                      <span>{formatUnits(position.baseSize, 18)}</span>
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
