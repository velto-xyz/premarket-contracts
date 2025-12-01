import type { PublicClient, WalletClient, Address } from 'viem';
import { ABIS, getContractAddresses } from './abis';
import { decodeContractError } from './errors';

/**
 * MockUSDC Service
 * Handles USDC token operations (testing only)
 */
export class MockUSDCService {
  constructor(
    private publicClient: PublicClient,
    private walletClient?: WalletClient
  ) {}

  async decimals(): Promise<number> {
    const addresses = getContractAddresses();
    const decimals = await this.publicClient.readContract({
      address: addresses.usdc,
      abi: ABIS.MockUSDC,
      functionName: 'decimals',
    });
    return Number(decimals);
  }

  async balanceOf(address: Address): Promise<bigint> {
    const addresses = getContractAddresses();
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
      const addresses = getContractAddresses();
      const account = this.walletClient.account;
      if (!account) throw new Error('No account connected');

      const { request } = await this.publicClient.simulateContract({
        address: addresses.usdc,
        abi: ABIS.MockUSDC,
        functionName: 'mint',
        args: [to, amount],
        account: account.address,
      });

      const hash = await this.walletClient.writeContract(request);
      await this.publicClient.waitForTransactionReceipt({ hash });

      return { txHash: hash };
    } catch (error: any) {
      const contractError = decodeContractError(error, ABIS.MockUSDC);
      throw new Error(contractError.message);
    }
  }

  async faucet(): Promise<{ txHash: string }> {
    if (!this.walletClient) throw new Error('Wallet client required');

    try {
      const addresses = getContractAddresses();
      const account = this.walletClient.account;
      if (!account) throw new Error('No account connected');

      const { request } = await this.publicClient.simulateContract({
        address: addresses.usdc,
        abi: ABIS.MockUSDC,
        functionName: 'faucet',
        account: account.address,
      });

      const hash = await this.walletClient.writeContract(request);
      await this.publicClient.waitForTransactionReceipt({ hash });

      return { txHash: hash };
    } catch (error: any) {
      const contractError = decodeContractError(error, ABIS.MockUSDC);
      throw new Error(contractError.message);
    }
  }

  async approve(spender: Address, amount: bigint): Promise<{ txHash: string }> {
    if (!this.walletClient) throw new Error('Wallet client required');

    try {
      const addresses = getContractAddresses();
      const account = this.walletClient.account;
      if (!account) throw new Error('No account connected');

      const { request } = await this.publicClient.simulateContract({
        address: addresses.usdc,
        abi: ABIS.MockUSDC,
        functionName: 'approve',
        args: [spender, amount],
        account: account.address,
      });

      const hash = await this.walletClient.writeContract(request);
      await this.publicClient.waitForTransactionReceipt({ hash });

      return { txHash: hash };
    } catch (error: any) {
      const contractError = decodeContractError(error, ABIS.MockUSDC);
      throw new Error(contractError.message);
    }
  }
}
