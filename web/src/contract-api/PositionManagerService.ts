import type { PublicClient, Address } from 'viem';
import { ABIS } from './abis';
import { decodeContractError } from './errors';
import type { Position, PositionEquity } from './types';

/**
 * PositionManager Service
 * Handles position queries and health calculations
 */
export class PositionManagerService {
  constructor(private publicClient: PublicClient) {}

  async getPosition(positionManagerAddress: Address, positionId: bigint): Promise<Position> {
    try {
      const position = await this.publicClient.readContract({
        address: positionManagerAddress,
        abi: ABIS.PositionManager,
        functionName: 'getPosition',
        args: [positionId],
      });

      return position as Position;
    } catch (error: any) {
      const contractError = decodeContractError(error, ABIS.PositionManager);
      throw new Error(contractError.message);
    }
  }

  async isPositionOpen(positionManagerAddress: Address, positionId: bigint): Promise<boolean> {
    try {
      const isOpen = await this.publicClient.readContract({
        address: positionManagerAddress,
        abi: ABIS.PositionManager,
        functionName: 'isPositionOpen',
        args: [positionId],
      });

      return isOpen as boolean;
    } catch (error: any) {
      const contractError = decodeContractError(error, ABIS.PositionManager);
      throw new Error(contractError.message);
    }
  }

  async simulateEquityIfClosed(positionManagerAddress: Address, positionId: bigint): Promise<PositionEquity> {
    try {
      const result = await this.publicClient.readContract({
        address: positionManagerAddress,
        abi: ABIS.PositionManager,
        functionName: 'simulateEquityIfClosed',
        args: [positionId],
      });

      const [closeNotional, avgClosePrice, pnlTrade, carryPnl, totalPnl, equityIfClosed] = result as [bigint, bigint, bigint, bigint, bigint, bigint];

      return {
        closeNotional,
        avgClosePrice,
        pnlTrade,
        carryPnl,
        totalPnl,
        equityIfClosed,
      };
    } catch (error: any) {
      const contractError = decodeContractError(error, ABIS.PositionManager);
      throw new Error(contractError.message);
    }
  }

  async getEffectiveOpenFeeRate(positionManagerAddress: Address): Promise<bigint> {
    try {
      const feeRate = await this.publicClient.readContract({
        address: positionManagerAddress,
        abi: ABIS.PositionManager,
        functionName: 'getEffectiveOpenFeeRate',
      });

      return feeRate as bigint;
    } catch (error: any) {
      const contractError = decodeContractError(error, ABIS.PositionManager);
      throw new Error(contractError.message);
    }
  }

  async getLiquidationBufferRatio(positionManagerAddress: Address, leverage: bigint): Promise<bigint> {
    try {
      const bufferRatio = await this.publicClient.readContract({
        address: positionManagerAddress,
        abi: ABIS.PositionManager,
        functionName: 'getLiquidationBufferRatio',
        args: [leverage],
      });

      return bufferRatio as bigint;
    } catch (error: any) {
      const contractError = decodeContractError(error, ABIS.PositionManager);
      throw new Error(contractError.message);
    }
  }
}
