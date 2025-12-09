import { useEffect, useState } from 'react';
import { useReadContract, useChainId, usePublicClient } from 'wagmi';
import { useMarketStore } from '../store/marketStore';
import { ABIS, getContractAddresses, ContractService } from '../contract-api';
import { formatCompact } from '../utils/format';

// Market display names mapped by index
const MARKET_NAMES: Record<number, string> = {
  0: 'SpaceX',
  1: 'Stripe',
  2: 'Velto',
};

export function MarketSelector() {
  const { selectedMarket, setSelectedMarket } = useMarketStore();
  const chainId = useChainId();
  const addresses = getContractAddresses(chainId);
  const publicClient = usePublicClient();
  const [poolSizes, setPoolSizes] = useState<Record<string, number>>({});

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

  // Fetch pool sizes for all markets
  useEffect(() => {
    if (!markets || !publicClient) return;

    const fetchPoolSizes = async () => {
      const service = new ContractService(chainId, publicClient);
      const sizes: Record<string, number> = {};

      for (const marketAddress of markets as string[]) {
        try {
          const marketData = await service.engine.getFullMarketData(marketAddress as `0x${string}`);
          sizes[marketAddress] = Number(marketData.quoteReserve) / 1e18;
        } catch (err) {
          console.error(`Failed to fetch pool size for ${marketAddress}:`, err);
        }
      }

      setPoolSizes(sizes);
    };

    fetchPoolSizes();
  }, [markets, chainId, publicClient]);

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
        {markets?.map((marketAddress: string, index: number) => {
          const poolSize = poolSizes[marketAddress];
          const sizeDisplay = poolSize ? ` ($${formatCompact(poolSize)})` : '';
          return (
            <option key={marketAddress} value={marketAddress}>
              {MARKET_NAMES[index] || `Market ${index + 1}`}{sizeDisplay}
            </option>
          );
        })}
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
