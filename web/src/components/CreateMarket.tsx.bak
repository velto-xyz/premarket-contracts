import { useState } from 'react';
import { useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { parseUnits } from 'viem';
import { ABIS } from '../contract-api';

const FACTORY_ADDRESS = import.meta.env.VITE_FACTORY_ADDRESS as `0x${string}`;
const USDC_ADDRESS = import.meta.env.VITE_USDC_ADDRESS as `0x${string}`;

export function CreateMarket() {
  const [isExpanded, setIsExpanded] = useState(false);
  const [name, setName] = useState('');
  const [symbol, setSymbol] = useState('');
  const [baseReserve, setBaseReserve] = useState('1000000');
  const [quoteReserve, setQuoteReserve] = useState('2000000000');
  const [maxLeverage, setMaxLeverage] = useState('30');

  const { writeContract, data: hash } = useWriteContract();
  const { isLoading: isCreating, isSuccess } = useWaitForTransactionReceipt({ hash });

  const handleCreate = () => {
    if (!name || !symbol || !baseReserve || !quoteReserve || !maxLeverage) {
      alert('Please fill in all fields');
      return;
    }

    writeContract({
      address: FACTORY_ADDRESS,
      abi: ABIS.PerpFactory,
      functionName: 'createMarket',
      args: [
        USDC_ADDRESS,
        {
          baseReserve: parseUnits(baseReserve, 18),
          quoteReserve: parseUnits(quoteReserve, 18),
          maxLeverage: parseUnits(maxLeverage, 18),
          name,
          symbol,
        },
      ],
    });
  };

  if (isSuccess) {
    setTimeout(() => {
      setIsExpanded(false);
      setName('');
      setSymbol('');
    }, 2000);
  }

  return (
    <div className="create-market">
      <button
        className="create-market-toggle"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {isExpanded ? '▼' : '+'} Create New Market
      </button>

      {isExpanded && (
        <div className="create-market-form">
          <div className="form-row">
            <label>Market Name:</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., DOGE Perpetual"
            />
          </div>

          <div className="form-row">
            <label>Symbol:</label>
            <input
              type="text"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              placeholder="e.g., DOGE"
            />
          </div>

          <div className="form-row">
            <label>Base Reserve:</label>
            <input
              type="text"
              value={baseReserve}
              onChange={(e) => setBaseReserve(e.target.value)}
              placeholder="1000000"
            />
          </div>

          <div className="form-row">
            <label>Quote Reserve (USDC):</label>
            <input
              type="text"
              value={quoteReserve}
              onChange={(e) => setQuoteReserve(e.target.value)}
              placeholder="2000000000"
            />
          </div>

          <div className="form-row">
            <label>Max Leverage:</label>
            <input
              type="text"
              value={maxLeverage}
              onChange={(e) => setMaxLeverage(e.target.value)}
              placeholder="30"
            />
          </div>

          <button
            className="create-market-button"
            onClick={handleCreate}
            disabled={isCreating}
          >
            {isCreating ? 'Creating...' : 'Create Market'}
          </button>

          {isSuccess && <p className="success">✅ Market created successfully!</p>}
        </div>
      )}
    </div>
  );
}
