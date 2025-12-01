import { useMemo } from 'react';
import { usePublicClient, useWalletClient } from 'wagmi';
import { ContractService } from '../contract-api';

/**
 * Hook to access the contract service layer
 * Provides simplified API for all contract interactions
 */
export function useContractService() {
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();

  const service = useMemo(() => {
    if (!publicClient) return null;
    return new ContractService(publicClient, walletClient || undefined);
  }, [publicClient, walletClient]);

  return service;
}
