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

  // Refresh data on interval
  useEffect(() => {
    if (!selectedMarket) return;

    const interval = setInterval(() => {
      refetchBaseReserve();
      refetchQuoteReserve();
      refetchMarkPrice();
      refetchLongOI();
      refetchShortOI();
      refetchCarry();
      refetchFunds();
    }, refreshInterval);

    return () => clearInterval(interval);
  }, [selectedMarket, refreshInterval, refetchBaseReserve, refetchQuoteReserve, refetchMarkPrice, refetchLongOI, refetchShortOI, refetchCarry, refetchFunds]);

  // Combine all data
  useEffect(() => {
    if (!baseReserve || !quoteReserve || !markPrice || !longOI || !shortOI || !carryIndex || !fundBalances) {
      return;
    }

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

    setData(newData);
  }, [baseReserve, quoteReserve, markPrice, longOI, shortOI, carryIndex, lastUpdateBlock, fundBalances]);

  return data;
}
