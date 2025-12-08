import { useEffect } from 'react';
import { useReadContract, useChainId } from 'wagmi';
import { useMarketStore } from '../store/marketStore';
import { ABIS, getContractAddresses } from '../contract-api';

// Market display names mapped by index
const MARKET_NAMES: Record<number, string> = {
  0: 'SpaceX Perpetual',
  1: 'OpenAI Perpetual',
  2: 'Vento Perpetual',
};

export function MarketSelector() {
  const { selectedMarket, setSelectedMarket } = useMarketStore();
  const chainId = useChainId();
  const addresses = getContractAddresses(chainId);

  const { data: markets, isError, isLoading, error } = useReadContract({
    address: addresses.factory,
    abi: ABIS.PerpFactory,
    functionName: 'getAllMarkets',
    query: { enabled: !!addresses.factory },
  });

  // Auto-select first market if none selected and markets are loaded
  useEffect(() => {
    if (!selectedMarket && markets && markets.length > 0) {
      setSelectedMarket(markets[0]);
    }
  }, [selectedMarket, markets, setSelectedMarket]);

  const getErrorMessage = () => {
    if (!error) return '⚠️ Contract call failed';

    const errorStr = error.toString();
    if (errorStr.includes('does not have any code') || errorStr.includes('no code at address')) {
      return `⚠️ Factory contract not deployed at ${addresses.factory}`;
    }
    if (errorStr.includes('execution reverted')) {
      return '⚠️ Contract execution reverted';
    }
    if (errorStr.includes('network')) {
      return '⚠️ Network connection failed';
    }
    return `⚠️ Contract error: ${errorStr.slice(0, 50)}...`;
  };

  return (
    <div className="market-selector">
      <h2>Market</h2>
      <select
        value={selectedMarket || ''}
        onChange={(e) => setSelectedMarket(e.target.value)}
        disabled={isError || isLoading}
      >
        <option value="">
          {isLoading ? 'Loading markets...' : 'Select Market...'}
        </option>
        {markets?.map((marketAddress: string, index: number) => (
          <option key={marketAddress} value={marketAddress}>
            {MARKET_NAMES[index] || `Market ${index + 1}`}
          </option>
        ))}
      </select>
      {isError && <p className="market-info error">{getErrorMessage()}</p>}
      {markets && markets.length > 0 && (
        <p className="market-info">✅ {markets.length} markets available</p>
      )}
      {markets && markets.length === 0 && !isError && (
        <p className="market-info">No markets deployed</p>
      )}
    </div>
  );
}
