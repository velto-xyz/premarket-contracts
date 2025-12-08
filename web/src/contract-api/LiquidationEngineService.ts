import type { PublicClient, Address } from 'viem';
import { ABIS, getContractAddresses } from './abis';
import { decodeContractError } from './errors';
import type { LiquidationInfo } from './types';

/**
 * LiquidationEngine Service
 * Handles liquidation checks and calculations
 */
export class LiquidationEngineService {
  constructor(
    private chainId: number,
    private publicClient: PublicClient
  ) {}

  async isLiquidatable(
    positionManagerAddress: Address,
    marketAddress: Address,
    positionId: bigint
  ): Promise<boolean> {
    try {
      const addresses = getContractAddresses(this.chainId);
      // TODO: Get actual liquidation engine address from factory
      const liquidationEngine = addresses.factory;

      const result = await this.publicClient.readContract({
        address: liquidationEngine,
        abi: ABIS.LiquidationEngine,
        functionName: 'isLiquidatable',
        args: [positionManagerAddress, marketAddress, positionId],
      });

      return result as boolean;
    } catch (error: any) {
      const contractError = decodeContractError(error, ABIS.LiquidationEngine);
      throw new Error(contractError.message);
    }
  }

  async getLiquidationInfo(
    positionManagerAddress: Address,
    marketAddress: Address,
    positionId: bigint
  ): Promise<LiquidationInfo> {
    try {
      const addresses = getContractAddresses(this.chainId);
      const liquidationEngine = addresses.factory;

      const result = await this.publicClient.readContract({
        address: liquidationEngine,
        abi: ABIS.LiquidationEngine,
        functionName: 'getLiquidationInfo',
        args: [positionManagerAddress, marketAddress, positionId],
      });

      const [isLiq, currentLoss, allowedLoss, equity, leverage] = result as [boolean, bigint, bigint, bigint, bigint];

      return {
        isLiquidatable: isLiq,
        currentLoss,
        allowedLoss,
        equity,
        leverage,
      };
    } catch (error: any) {
      const contractError = decodeContractError(error, ABIS.LiquidationEngine);
      throw new Error(contractError.message);
    }
  }

  async calculateLiquidationFee(
    positionManagerAddress: Address,
    marketAddress: Address,
    positionId: bigint
  ): Promise<bigint> {
    try {
      const addresses = getContractAddresses(this.chainId);
      const liquidationEngine = addresses.factory;

      const fee = await this.publicClient.readContract({
        address: liquidationEngine,
        abi: ABIS.LiquidationEngine,
        functionName: 'calculateLiquidationFee',
        args: [positionManagerAddress, marketAddress, positionId],
      });

      return fee as bigint;
    } catch (error: any) {
      const contractError = decodeContractError(error, ABIS.LiquidationEngine);
      throw new Error(contractError.message);
    }
  }
}
