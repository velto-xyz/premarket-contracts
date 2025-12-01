import type { PublicClient, Address } from 'viem';
import { ABIS } from './abis';
import { decodeContractError } from './errors';

/**
 * FundingManager Service
 * Handles funding rate calculations
 */
export class FundingManagerService {
  constructor(private publicClient: PublicClient) {}

  async calculateUpdatedCarry(
    fundingManagerAddress: Address,
    marketAddress: Address
  ): Promise<{ newCarryIndex: bigint; carryPerBlock: bigint }> {
    try {
      const result = await this.publicClient.readContract({
        address: fundingManagerAddress,
        abi: ABIS.FundingManager,
        functionName: 'calculateUpdatedCarry',
        args: [marketAddress],
      });

      const [newCarryIndex, carryPerBlock] = result as [bigint, bigint];
      return { newCarryIndex, carryPerBlock };
    } catch (error: any) {
      const contractError = decodeContractError(error, ABIS.FundingManager);
      throw new Error(contractError.message);
    }
  }

  async getCurrentCarryIndex(fundingManagerAddress: Address, marketAddress: Address): Promise<bigint> {
    try {
      const carryIndex = await this.publicClient.readContract({
        address: fundingManagerAddress,
        abi: ABIS.FundingManager,
        functionName: 'getCurrentCarryIndex',
        args: [marketAddress],
      });

      return carryIndex as bigint;
    } catch (error: any) {
      const contractError = decodeContractError(error, ABIS.FundingManager);
      throw new Error(contractError.message);
    }
  }

  async calculateCarryPnl(
    fundingManagerAddress: Address,
    marketAddress: Address,
    isLong: boolean,
    notional: bigint,
    carrySnapshot: bigint
  ): Promise<bigint> {
    try {
      const carryPnl = await this.publicClient.readContract({
        address: fundingManagerAddress,
        abi: ABIS.FundingManager,
        functionName: 'calculateCarryPnl',
        args: [marketAddress, isLong, notional, carrySnapshot],
      });

      return carryPnl as bigint;
    } catch (error: any) {
      const contractError = decodeContractError(error, ABIS.FundingManager);
      throw new Error(contractError.message);
    }
  }
}
