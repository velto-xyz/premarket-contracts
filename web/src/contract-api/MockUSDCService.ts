import type { PublicClient, WalletClient, Address } from 'viem';
import { ABIS, getContractAddresses } from './abis';
import { executeTransaction, decodeContractError } from '@velto/contracts';

/**
 * MockUSDC Service
 * Handles USDC token operations (testing only)
 */
export class MockUSDCService {
  constructor(
    private chainId: number,
    private publicClient: PublicClient,
    private walletClient?: WalletClient
  ) {}

  async decimals(): Promise<number> {
    const addresses = getContractAddresses(this.chainId);
    const decimals = await this.publicClient.readContract({
      address: addresses.usdc,
      abi: ABIS.MockUSDC,
      functionName: 'decimals',
    });
    return Number(decimals);
  }

  async balanceOf(address: Address): Promise<bigint> {
    const addresses = getContractAddresses(this.chainId);
    const balance = await this.publicClient.readContract({
      address: addresses.usdc,
      abi: ABIS.MockUSDC,
      functionName: 'balanceOf',
      args: [address],
    });
    return balance as bigint;
  }

  async mint(to: Address, amount: bigint): Promise<{ txHash: string }> {
    if (!this.walletClient) throw new Error('Wallet client required');

    try {
      const addresses = getContractAddresses(this.chainId);
      const { hash } = await executeTransaction({
        publicClient: this.publicClient,
        walletClient: this.walletClient,
        address: addresses.usdc,
        abi: ABIS.MockUSDC,
        functionName: 'mint',
        args: [to, amount],
      });

      return { txHash: hash };
    } catch (error: any) {
      const contractError = decodeContractError(error, ABIS.MockUSDC);
      throw new Error(contractError.message);
    }
  }

  async faucet(): Promise<{ txHash: string }> {
    if (!this.walletClient) throw new Error('Wallet client required');

    try {
      const addresses = getContractAddresses(this.chainId);
      const { hash } = await executeTransaction({
        publicClient: this.publicClient,
        walletClient: this.walletClient,
        address: addresses.usdc,
        abi: ABIS.MockUSDC,
        functionName: 'faucet',
      });

      return { txHash: hash };
    } catch (error: any) {
      const contractError = decodeContractError(error, ABIS.MockUSDC);
      throw new Error(contractError.message);
    }
  }

  async approve(spender: Address, amount: bigint): Promise<{ txHash: string }> {
    if (!this.walletClient) throw new Error('Wallet client required');

    try {
      const addresses = getContractAddresses(this.chainId);
      const { hash } = await executeTransaction({
        publicClient: this.publicClient,
        walletClient: this.walletClient,
        address: addresses.usdc,
        abi: ABIS.MockUSDC,
        functionName: 'approve',
        args: [spender, amount],
      });

      return { txHash: hash };
    } catch (error: any) {
      const contractError = decodeContractError(error, ABIS.MockUSDC);
      throw new Error(contractError.message);
    }
  }
}
