import type { PublicClient, WalletClient, Address } from 'viem';
import { parseEventLogs } from 'viem';
import { ABIS, getContractAddresses } from './abis';
import { decodeContractError } from './errors';

/**
 * PerpFactory Service
 * Handles market deployment and management
 */
export class PerpFactoryService {
  constructor(
    private chainId: number,
    private publicClient: PublicClient,
    private walletClient?: WalletClient
  ) {}

  async createMarket(
    collateralToken: Address,
    baseReserve: bigint,
    quoteReserve: bigint,
    maxLeverage?: bigint
  ): Promise<{ txHash: string; engineAddress?: Address }> {
    if (!this.walletClient) throw new Error('Wallet client required');

    try {
      const addresses = getContractAddresses(this.chainId);
      const account = this.walletClient.account;
      if (!account) throw new Error('No account connected');

      const { request } = await this.publicClient.simulateContract({
        address: addresses.factory,
        abi: ABIS.PerpFactory,
        functionName: 'createMarket',
        args: [collateralToken, { baseReserve, quoteReserve, maxLeverage: maxLeverage || 30n * 10n ** 18n }],
        account: account.address,
      });

      const hash = await this.walletClient.writeContract(request);
      const receipt = await this.publicClient.waitForTransactionReceipt({ hash });

      // Parse MarketCreated event
      const logs = parseEventLogs({
        abi: ABIS.PerpFactory,
        eventName: 'MarketCreated',
        logs: receipt.logs,
      });

      const engineAddress = logs[0]?.args?.engine as Address | undefined;

      return { txHash: hash, engineAddress };
    } catch (error: any) {
      const contractError = decodeContractError(error, ABIS.PerpFactory);
      throw new Error(contractError.message);
    }
  }

  async getMarketCount(): Promise<bigint> {
    try {
      const addresses = getContractAddresses(this.chainId);
      const count = await this.publicClient.readContract({
        address: addresses.factory,
        abi: ABIS.PerpFactory,
        functionName: 'getMarketCount',
      });

      return count as bigint;
    } catch (error: any) {
      const contractError = decodeContractError(error, ABIS.PerpFactory);
      throw new Error(contractError.message);
    }
  }

  async getMarket(index: bigint): Promise<Address> {
    try {
      const addresses = getContractAddresses(this.chainId);
      const engineAddress = await this.publicClient.readContract({
        address: addresses.factory,
        abi: ABIS.PerpFactory,
        functionName: 'getMarket',
        args: [index],
      });

      return engineAddress as Address;
    } catch (error: any) {
      const contractError = decodeContractError(error, ABIS.PerpFactory);
      throw new Error(contractError.message);
    }
  }

  async getAllMarkets(): Promise<Address[]> {
    try {
      const addresses = getContractAddresses(this.chainId);
      const markets = await this.publicClient.readContract({
        address: addresses.factory,
        abi: ABIS.PerpFactory,
        functionName: 'getAllMarkets',
      });

      return markets as Address[];
    } catch (error: any) {
      const contractError = decodeContractError(error, ABIS.PerpFactory);
      throw new Error(contractError.message);
    }
  }
}
