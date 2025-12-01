import type { PublicClient, Address } from 'viem';
import { ABIS } from './abis';
import { decodeContractError } from './errors';

/**
 * PerpMarket Service
 * Handles vAMM operations and market state queries
 */
export class PerpMarketService {
  constructor(private publicClient: PublicClient) {}

  async getMarkPrice(marketAddress: Address): Promise<bigint> {
    try {
      const price = await this.publicClient.readContract({
        address: marketAddress,
        abi: ABIS.PerpMarket,
        functionName: 'getMarkPrice',
      });

      return price as bigint;
    } catch (error: any) {
      const contractError = decodeContractError(error, ABIS.PerpMarket);
      throw new Error(contractError.message);
    }
  }

  async simulateOpenLong(marketAddress: Address, quoteIn: bigint): Promise<{ baseOut: bigint; avgPrice: bigint }> {
    try {
      const result = await this.publicClient.readContract({
        address: marketAddress,
        abi: ABIS.PerpMarket,
        functionName: 'simulateOpenLong',
        args: [quoteIn],
      });

      const [baseOut, avgPrice] = result as [bigint, bigint];
      return { baseOut, avgPrice };
    } catch (error: any) {
      const contractError = decodeContractError(error, ABIS.PerpMarket);
      throw new Error(contractError.message);
    }
  }

  async simulateOpenShort(marketAddress: Address, quoteOut: bigint): Promise<{ baseIn: bigint; avgPrice: bigint }> {
    try {
      const result = await this.publicClient.readContract({
        address: marketAddress,
        abi: ABIS.PerpMarket,
        functionName: 'simulateOpenShort',
        args: [quoteOut],
      });

      const [baseIn, avgPrice] = result as [bigint, bigint];
      return { baseIn, avgPrice };
    } catch (error: any) {
      const contractError = decodeContractError(error, ABIS.PerpMarket);
      throw new Error(contractError.message);
    }
  }

  async simulateCloseLong(marketAddress: Address, baseSize: bigint): Promise<{ quoteOut: bigint; avgPrice: bigint }> {
    try {
      const result = await this.publicClient.readContract({
        address: marketAddress,
        abi: ABIS.PerpMarket,
        functionName: 'simulateCloseLong',
        args: [baseSize],
      });

      const [quoteOut, avgPrice] = result as [bigint, bigint];
      return { quoteOut, avgPrice };
    } catch (error: any) {
      const contractError = decodeContractError(error, ABIS.PerpMarket);
      throw new Error(contractError.message);
    }
  }

  async simulateCloseShort(marketAddress: Address, baseSize: bigint): Promise<{ quoteIn: bigint; avgPrice: bigint }> {
    try {
      const result = await this.publicClient.readContract({
        address: marketAddress,
        abi: ABIS.PerpMarket,
        functionName: 'simulateCloseShort',
        args: [baseSize],
      });

      const [quoteIn, avgPrice] = result as [bigint, bigint];
      return { quoteIn, avgPrice };
    } catch (error: any) {
      const contractError = decodeContractError(error, ABIS.PerpMarket);
      throw new Error(contractError.message);
    }
  }

  async getReserves(marketAddress: Address): Promise<{ baseReserve: bigint; quoteReserve: bigint; k: bigint }> {
    try {
      const [baseReserve, quoteReserve, k] = await Promise.all([
        this.publicClient.readContract({
          address: marketAddress,
          abi: ABIS.PerpMarket,
          functionName: 'baseReserve',
        }),
        this.publicClient.readContract({
          address: marketAddress,
          abi: ABIS.PerpMarket,
          functionName: 'quoteReserve',
        }),
        this.publicClient.readContract({
          address: marketAddress,
          abi: ABIS.PerpMarket,
          functionName: 'k',
        }),
      ]);

      return {
        baseReserve: baseReserve as bigint,
        quoteReserve: quoteReserve as bigint,
        k: k as bigint,
      };
    } catch (error: any) {
      const contractError = decodeContractError(error, ABIS.PerpMarket);
      throw new Error(contractError.message);
    }
  }

  async getOpenInterest(marketAddress: Address): Promise<{ longOI: bigint; shortOI: bigint }> {
    try {
      const [longOI, shortOI] = await Promise.all([
        this.publicClient.readContract({
          address: marketAddress,
          abi: ABIS.PerpMarket,
          functionName: 'longOpenInterest',
        }),
        this.publicClient.readContract({
          address: marketAddress,
          abi: ABIS.PerpMarket,
          functionName: 'shortOpenInterest',
        }),
      ]);

      return {
        longOI: longOI as bigint,
        shortOI: shortOI as bigint,
      };
    } catch (error: any) {
      const contractError = decodeContractError(error, ABIS.PerpMarket);
      throw new Error(contractError.message);
    }
  }

  async getFundingState(marketAddress: Address): Promise<{ carryIndex: bigint; lastFundingBlock: bigint; currentBlock: bigint }> {
    try {
      const [carryIndex, lastFundingBlock, currentBlock] = await Promise.all([
        this.publicClient.readContract({
          address: marketAddress,
          abi: ABIS.PerpMarket,
          functionName: 'cumulativeCarryIndex',
        }),
        this.publicClient.readContract({
          address: marketAddress,
          abi: ABIS.PerpMarket,
          functionName: 'lastFundingBlock',
        }),
        this.publicClient.readContract({
          address: marketAddress,
          abi: ABIS.PerpMarket,
          functionName: 'currentBlock',
        }),
      ]);

      return {
        carryIndex: carryIndex as bigint,
        lastFundingBlock: lastFundingBlock as bigint,
        currentBlock: currentBlock as bigint,
      };
    } catch (error: any) {
      const contractError = decodeContractError(error, ABIS.PerpMarket);
      throw new Error(contractError.message);
    }
  }
}
