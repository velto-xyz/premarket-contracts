import { useState, useEffect } from 'react';
import { useAccount, useChainId, usePublicClient, useWalletClient, useReadContract } from 'wagmi';
import { parseUnits } from 'viem';
import { ContractService, getContractAddresses, ABIS } from '../contract-api';

// Default values that create a market with ~$2000 mark price
const DEFAULT_BASE_RESERVE = '1000000';     // 1M base tokens
const DEFAULT_QUOTE_RESERVE = '2000000000'; // 2B quote tokens ($2000 price)
const DEFAULT_MAX_LEVERAGE = '30';          // 30x max

export function CreateMarket() {
  const { address } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const addresses = getContractAddresses(chainId);

  const [isOpen, setIsOpen] = useState(false);
  const [baseReserve, setBaseReserve] = useState(DEFAULT_BASE_RESERVE);
  const [quoteReserve, setQuoteReserve] = useState(DEFAULT_QUOTE_RESERVE);
  const [maxLeverage, setMaxLeverage] = useState(DEFAULT_MAX_LEVERAGE);
  const [isCreating, setIsCreating] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check authorization using wagmi hooks
  const { data: isMarketCreator } = useReadContract({
    address: addresses.factory,
    abi: ABIS.PerpFactory,
    functionName: 'isMarketCreator',
    args: address ? [address] : undefined,
    query: { enabled: !!address && !!addresses.factory },
  });

  const { data: owner } = useReadContract({
    address: addresses.factory,
    abi: ABIS.PerpFactory,
    functionName: 'owner',
    query: { enabled: !!addresses.factory },
  });

  const isAuthorized = address && (isMarketCreator || address === owner);

  const calculateMarkPrice = () => {
    try {
      const base = parseFloat(baseReserve);
      const quote = parseFloat(quoteReserve);
      if (base > 0) {
        return (quote / base).toFixed(2);
      }
    } catch (e) {
      return '0';
    }
    return '0';
  };

  const handleCreate = async () => {
    if (!baseReserve || !quoteReserve || !maxLeverage) {
      alert('Please fill in all fields');
      return;
    }

    const leverage = parseFloat(maxLeverage);
    if (leverage <= 0 || leverage > 30) {
      alert('Max leverage must be between 0 and 30');
      return;
    }

    if (!publicClient || !walletClient) {
      alert('Please connect your wallet');
      return;
    }

    setIsCreating(true);
    setError(null);
    setIsSuccess(false);

    try {
      const contractService = new ContractService(chainId, publicClient, walletClient);

      const result = await contractService.factory.createMarket(
        addresses.usdc,
        parseUnits(baseReserve, 18),
        parseUnits(quoteReserve, 18),
        parseUnits(maxLeverage, 18)
      );

      console.log('Market created:', result);
      setIsSuccess(true);
    } catch (err: any) {
      console.error('Failed to create market:', err);
      setError(err.message || 'Failed to create market');
    } finally {
      setIsCreating(false);
    }
  };

  const handleReset = () => {
    setBaseReserve(DEFAULT_BASE_RESERVE);
    setQuoteReserve(DEFAULT_QUOTE_RESERVE);
    setMaxLeverage(DEFAULT_MAX_LEVERAGE);
  };

  if (isSuccess) {
    setTimeout(() => {
      setIsOpen(false);
      handleReset();
    }, 2000);
  }

  return (
    <>
      <button
        className="create-market-button"
        onClick={() => setIsOpen(true)}
        disabled={!address}
        title={!address ? 'Connect wallet to create markets' : 'Create new market'}
      >
        + Create New Market
      </button>

      {isOpen && (
        <div className="modal-overlay" onClick={() => setIsOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Create New Market</h2>
              <button className="modal-close" onClick={() => setIsOpen(false)}>
                ×
              </button>
            </div>

            <div className="modal-body">
              {!isAuthorized && address && (
                <div className="warning-message">
                  ⚠️ You are not authorized to create markets. Only the factory owner or authorized market creators can create new markets.
                </div>
              )}

              <div className="form-section">
                <div className="form-row">
                  <label>
                    Base Reserve
                    <span className="label-hint">Initial vAMM base token reserve (18 decimals)</span>
                  </label>
                  <input
                    type="text"
                    value={baseReserve}
                    onChange={(e) => setBaseReserve(e.target.value)}
                    placeholder="1000000"
                  />
                </div>

                <div className="form-row">
                  <label>
                    Quote Reserve (USDC)
                    <span className="label-hint">Initial vAMM quote token reserve (18 decimals)</span>
                  </label>
                  <input
                    type="text"
                    value={quoteReserve}
                    onChange={(e) => setQuoteReserve(e.target.value)}
                    placeholder="2000000000"
                  />
                </div>

                <div className="form-row">
                  <label>
                    Max Leverage
                    <span className="label-hint">Maximum allowed leverage (1-30x)</span>
                  </label>
                  <input
                    type="text"
                    value={maxLeverage}
                    onChange={(e) => setMaxLeverage(e.target.value)}
                    placeholder="30"
                  />
                </div>

                <div className="form-info">
                  <div className="info-row">
                    <span>Initial Mark Price:</span>
                    <span className="info-value">${calculateMarkPrice()}</span>
                  </div>
                  <div className="info-row">
                    <span>Collateral Token:</span>
                    <span className="info-value">USDC</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <button className="button-secondary" onClick={handleReset}>
                Reset to Defaults
              </button>
              <button
                className="button-primary"
                onClick={handleCreate}
                disabled={isCreating || !isAuthorized}
                title={!isAuthorized ? 'You are not authorized to create markets' : ''}
              >
                {isCreating ? 'Creating...' : 'Create Market'}
              </button>
            </div>

            {isSuccess && (
              <div className="success-message">
                ✅ Market created successfully!
              </div>
            )}

            {error && (
              <div className="error-message">
                ❌ {error.includes('Unauthorized')
                  ? 'Unauthorized: Only factory owner or authorized creators can create markets'
                  : error}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
