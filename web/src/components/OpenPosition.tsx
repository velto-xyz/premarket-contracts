import { useState } from 'react';
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { parseUnits } from 'viem';
import { useMarketStore } from '../store/marketStore';

// Placeholder ABI - will be replaced after abi:export
const ENGINE_ABI = [
  {
    inputs: [
      { name: 'isLong', type: 'bool' },
      { name: 'totalToUse', type: 'uint256' },
      { name: 'leverage', type: 'uint256' },
    ],
    name: 'openPosition',
    outputs: [{ name: 'positionId', type: 'uint256' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const;

export function OpenPosition() {
  const { isConnected } = useAccount();
  const { selectedMarket } = useMarketStore();
  const [isLong, setIsLong] = useState(true);
  const [amount, setAmount] = useState('');
  const [leverage, setLeverage] = useState('10');

  const { writeContract, data: hash } = useWriteContract();
  const { isLoading } = useWaitForTransactionReceipt({ hash });

  const handleOpenPosition = () => {
    if (!amount || !leverage || !selectedMarket) return;

    const totalToUse = parseUnits(amount, 18); // Internal 18 decimals
    const leverageAmount = parseUnits(leverage, 18);

    writeContract({
      address: selectedMarket as `0x${string}`,
      abi: ENGINE_ABI,
      functionName: 'openPosition',
      args: [isLong, totalToUse, leverageAmount],
    });
  };

  if (!selectedMarket) {
    return <div className="open-position">Select a market first</div>;
  }

  if (!isConnected) {
    return (
      <div className="open-position">
        <h2>Open Position</h2>
        <div className="connect-prompt">
          <p>Connect your wallet to open a position</p>
          <ConnectButton />
        </div>
      </div>
    );
  }

  return (
    <div className="open-position">
      <h2>Open Position</h2>

      <div className="position-form">
        <div className="side-selector">
          <button
            className={isLong ? 'long active' : 'long'}
            onClick={() => setIsLong(true)}
          >
            Long
          </button>
          <button
            className={!isLong ? 'short active' : 'short'}
            onClick={() => setIsLong(false)}
          >
            Short
          </button>
        </div>

        <div className="form-group">
          <label>Amount (USDC)</label>
          <input
            type="number"
            placeholder="100"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            step="0.01"
          />
        </div>

        <div className="form-group">
          <label>Leverage (1-30x)</label>
          <input
            type="number"
            placeholder="10"
            value={leverage}
            onChange={(e) => setLeverage(e.target.value)}
            min="1"
            max="30"
            step="0.1"
          />
        </div>

        <div className="position-info">
          <p>
            Notional: {amount && leverage ? (parseFloat(amount) * parseFloat(leverage)).toFixed(2) : '0'} USDC
          </p>
        </div>

        <button
          className="open-position-button"
          onClick={handleOpenPosition}
          disabled={isLoading || !amount || !leverage}
        >
          {isLoading ? 'Opening...' : `Open ${isLong ? 'Long' : 'Short'}`}
        </button>
      </div>
    </div>
  );
}
