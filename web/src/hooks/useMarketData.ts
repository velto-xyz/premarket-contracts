import { useReadContract } from 'wagmi';
import { useMarketStore } from '../store/marketStore';
import { useEffect, useState } from 'react';
import { ABIS } from '../contract-api';

export interface MarketData {
  // Reserves
  baseReserve: bigint;
  quoteReserve: bigint;

  // Price
  markPrice: bigint;

  // Open Interest
  longOI: bigint;
  shortOI: bigint;
  netOI: bigint;

  // Funding
  carryIndex: bigint;
  lastUpdateBlock: bigint;

  // Funds
  tradeFund: bigint;
  insuranceFund: bigint;
  protocolFees: bigint;

  // Timestamp
  timestamp: number;
}

export function useMarketData(refreshInterval = 2000): MarketData | null {
  const { selectedMarket } = useMarketStore();
  const [data, setData] = useState<MarketData | null>(null);

  // Debug logs
  console.log('useMarketData: selectedMarket:', selectedMarket);

  // Get market address
  const {
    data: marketAddress,
    error: marketAddressError,
    isError: isMarketAddressError
  } = useReadContract({
    address: selectedMarket as `0x${string}`,
    abi: ABIS.PerpEngine,
    functionName: 'market',
  });

  // Get base reserve
  const {
    data: baseReserve,
    refetch: refetchBaseReserve,
    error: baseReserveError,
    isError: isBaseReserveError
  } = useReadContract({
    address: marketAddress as `0x${string}`,
    abi: ABIS.PerpMarket,
    functionName: 'baseReserve',
    query: {
      enabled: !!marketAddress,
    },
  });

  // Get quote reserve
  const {
    data: quoteReserve,
    refetch: refetchQuoteReserve,
    error: quoteReserveError,
    isError: isQuoteReserveError
  } = useReadContract({
    address: marketAddress as `0x${string}`,
    abi: ABIS.PerpMarket,
    functionName: 'quoteReserve',
    query: {
      enabled: !!marketAddress,
    },
  });

  // Get mark price
  const {
    data: markPrice,
    refetch: refetchMarkPrice,
    error: markPriceError,
    isError: isMarkPriceError
  } = useReadContract({
    address: marketAddress as `0x${string}`,
    abi: ABIS.PerpMarket,
    functionName: 'getMarkPrice',
    query: {
      enabled: !!marketAddress,
    },
  });

  // Get long open interest
  const {
    data: longOI,
    refetch: refetchLongOI,
    error: longOIError,
    isError: isLongOIError
  } = useReadContract({
    address: marketAddress as `0x${string}`,
    abi: ABIS.PerpMarket,
    functionName: 'longOpenInterest',
    query: {
      enabled: !!marketAddress,
    },
  });

  // Get short open interest
  const {
    data: shortOI,
    refetch: refetchShortOI,
    error: shortOIError,
    isError: isShortOIError
  } = useReadContract({
    address: marketAddress as `0x${string}`,
    abi: ABIS.PerpMarket,
    functionName: 'shortOpenInterest',
    query: {
      enabled: !!marketAddress,
    },
  });

  // Get carry index
  const {
    data: carryIndex,
    refetch: refetchCarry,
    error: carryIndexError,
    isError: isCarryIndexError
  } = useReadContract({
    address: marketAddress as `0x${string}`,
    abi: ABIS.PerpMarket,
    functionName: 'cumulativeCarryIndex',
    query: {
      enabled: !!marketAddress,
    },
  });

  // Get last funding block
  const {
    data: lastUpdateBlock,
    error: lastUpdateBlockError,
    isError: isLastUpdateBlockError
  } = useReadContract({
    address: marketAddress as `0x${string}`,
    abi: ABIS.PerpMarket,
    functionName: 'lastFundingBlock',
    query: {
      enabled: !!marketAddress,
    },
  });

  // Get fund balances
  const {
    data: fundBalances,
    refetch: refetchFunds,
    error: fundBalancesError,
    isError: isFundBalancesError
  } = useReadContract({
    address: selectedMarket as `0x${string}`,
    abi: ABIS.PerpEngine,
    functionName: 'getFundBalances',
  });

  // Log errors
  useEffect(() => {
    if (isMarketAddressError) console.error('Error fetching market address:', marketAddressError);
    if (isBaseReserveError) console.error('Error fetching base reserve:', baseReserveError);
    if (isQuoteReserveError) console.error('Error fetching quote reserve:', quoteReserveError);
    if (isMarkPriceError) console.error('Error fetching mark price:', markPriceError);
    if (isLongOIError) console.error('Error fetching long OI:', longOIError);
    if (isShortOIError) console.error('Error fetching short OI:', shortOIError);
    if (isCarryIndexError) console.error('Error fetching carry index:', carryIndexError);
    if (isLastUpdateBlockError) console.error('Error fetching last update block:', lastUpdateBlockError);
    if (isFundBalancesError) console.error('Error fetching fund balances:', fundBalancesError);
  }, [
    isMarketAddressError, marketAddressError,
    isBaseReserveError, baseReserveError,
    isQuoteReserveError, quoteReserveError,
    isMarkPriceError, markPriceError,
    isLongOIError, longOIError,
    isShortOIError, shortOIError,
    isCarryIndexError, carryIndexError,
    isLastUpdateBlockError, lastUpdateBlockError,
    isFundBalancesError, fundBalancesError
  ]);

  // Debug effect to log data loading state
  useEffect(() => {
    console.log('Market data loading state:', {
      marketAddress,
      hasBaseReserve: !!baseReserve,
      hasQuoteReserve: !!quoteReserve,
      hasMarkPrice: !!markPrice,
      hasLongOI: !!longOI,
      hasShortOI: !!shortOI,
      hasCarryIndex: !!carryIndex,
      hasLastUpdateBlock: !!lastUpdateBlock,
      hasFundBalances: !!fundBalances
    });
  }, [marketAddress, baseReserve, quoteReserve, markPrice, longOI, shortOI, carryIndex, lastUpdateBlock, fundBalances]);

  // Refresh data on interval
  useEffect(() => {
    if (!selectedMarket) {
      console.log('No market selected, skipping data refresh');
      return;
    }

    console.log('Starting data refresh interval');
    const interval = setInterval(() => {
      console.log('Refreshing market data...');
      refetchBaseReserve();
      refetchQuoteReserve();
      refetchMarkPrice();
      refetchLongOI();
      refetchShortOI();
      refetchCarry();
      refetchFunds();
    }, refreshInterval);

    return () => {
      console.log('Clearing data refresh interval');
      clearInterval(interval);
    };
  }, [selectedMarket, refreshInterval, refetchBaseReserve, refetchQuoteReserve, refetchMarkPrice, refetchLongOI, refetchShortOI, refetchCarry, refetchFunds]);

  // Combine all data
  useEffect(() => {
    if (!baseReserve || !quoteReserve || !markPrice || !longOI || !shortOI || !carryIndex || !fundBalances) {
      console.log('Waiting for all data to load...', {
        hasBaseReserve: !!baseReserve,
        hasQuoteReserve: !!quoteReserve,
        hasMarkPrice: !!markPrice,
        hasLongOI: !!longOI,
        hasShortOI: !!shortOI,
        hasCarryIndex: !!carryIndex,
        hasFundBalances: !!fundBalances
      });
      return;
    }

    console.log('All data loaded, updating market data...');
    const netOI = BigInt(longOI) - BigInt(shortOI);
    const newData = {
      baseReserve,
      quoteReserve,
      markPrice,
      longOI,
      shortOI,
      netOI,
      carryIndex,
      lastUpdateBlock: lastUpdateBlock || 0n,
      tradeFund: fundBalances[0],
      insuranceFund: fundBalances[1],
      protocolFees: fundBalances[2],
      timestamp: Date.now(),
    };

    console.log('New market data:', newData);
    setData(newData);
  }, [baseReserve, quoteReserve, markPrice, longOI, shortOI, carryIndex, lastUpdateBlock, fundBalances]);

  return data;
}
