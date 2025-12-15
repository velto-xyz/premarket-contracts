import type { PublicClient, WalletClient, Address } from 'viem';
import { parseEventLogs } from 'viem';
import { ABIS } from './abis';
import { executeTransaction, decodeContractError, type MarketData } from '@velto/contracts';

/**
 * PerpEngine Service
 * Main user-facing contract for trading operations
 */
export class PerpEngineService {
  constructor(
    private publicClient: PublicClient,
    private walletClient?: WalletClient
  ) {}

  async deposit(engineAddress: Address, amount: bigint): Promise<{ txHash: string }> {
    if (!this.walletClient) throw new Error('Wallet client required');

    try {
      const { hash } = await executeTransaction({
        publicClient: this.publicClient,
        walletClient: this.walletClient,
        address: engineAddress,
        abi: ABIS.PerpEngine,
        functionName: 'deposit',
        args: [amount],
      });

      return { txHash: hash };
    } catch (error: any) {
      const contractError = decodeContractError(error, ABIS.PerpEngine);
      throw new Error(contractError.message);
    }
  }

  async withdraw(engineAddress: Address, amount: bigint): Promise<{ txHash: string }> {
    if (!this.walletClient) throw new Error('Wallet client required');

    try {
      const { hash } = await executeTransaction({
        publicClient: this.publicClient,
        walletClient: this.walletClient,
        address: engineAddress,
        abi: ABIS.PerpEngine,
        functionName: 'withdraw',
        args: [amount],
      });

      return { txHash: hash };
    } catch (error: any) {
      const contractError = decodeContractError(error, ABIS.PerpEngine);
      throw new Error(contractError.message);
    }
  }

  async openPosition(
    engineAddress: Address,
    isLong: boolean,
    totalToUse: bigint,
    leverage: bigint
  ): Promise<{ txHash: string; positionId?: bigint }> {
    if (!this.walletClient) throw new Error('Wallet client required');

    try {
      const { hash, receipt } = await executeTransaction({
        publicClient: this.publicClient,
        walletClient: this.walletClient,
        address: engineAddress,
        abi: ABIS.PerpEngine,
        functionName: 'openPosition',
        args: [isLong, totalToUse, leverage],
      });

      // Parse PositionOpened event to get position ID
      const logs = parseEventLogs({
        abi: ABIS.PerpEngine,
        eventName: 'PositionOpened',
        logs: receipt.logs,
      });

      const positionId = logs[0]?.args?.positionId as bigint | undefined;

      return { txHash: hash, positionId };
    } catch (error: any) {
      const contractError = decodeContractError(error, ABIS.PerpEngine);
      throw new Error(contractError.message);
    }
  }

  async closePosition(engineAddress: Address, positionId: bigint): Promise<{ txHash: string; totalPnl?: bigint }> {
    if (!this.walletClient) throw new Error('Wallet client required');

    try {
      const { hash, receipt } = await executeTransaction({
        publicClient: this.publicClient,
        walletClient: this.walletClient,
        address: engineAddress,
        abi: ABIS.PerpEngine,
        functionName: 'closePosition',
        args: [positionId],
      });

      // Parse PositionClosed event
      const logs = parseEventLogs({
        abi: ABIS.PerpEngine,
        eventName: 'PositionClosed',
        logs: receipt.logs,
      });

      const totalPnl = logs[0]?.args?.totalPnl as bigint | undefined;

      return { txHash: hash, totalPnl };
    } catch (error: any) {
      const contractError = decodeContractError(error, ABIS.PerpEngine);
      throw new Error(contractError.message);
    }
  }

  async liquidate(engineAddress: Address, positionId: bigint): Promise<{ txHash: string }> {
    if (!this.walletClient) throw new Error('Wallet client required');

    try {
      const { hash } = await executeTransaction({
        publicClient: this.publicClient,
        walletClient: this.walletClient,
        address: engineAddress,
        abi: ABIS.PerpEngine,
        functionName: 'liquidate',
        args: [positionId],
      });

      return { txHash: hash };
    } catch (error: any) {
      const contractError = decodeContractError(error, ABIS.PerpEngine);
      throw new Error(contractError.message);
    }
  }

  async getWalletBalance(engineAddress: Address, userAddress: Address): Promise<bigint> {
    try {
      const balance = await this.publicClient.readContract({
        address: engineAddress,
        abi: ABIS.PerpEngine,
        functionName: 'getWalletBalance',
        args: [userAddress],
      });

      return balance as bigint;
    } catch (error: any) {
      const contractError = decodeContractError(error, ABIS.PerpEngine);
      throw new Error(contractError.message);
    }
  }

  async getFundBalances(engineAddress: Address): Promise<{ trade: bigint; insurance: bigint; protocol: bigint }> {
    try {
      const result = await this.publicClient.readContract({
        address: engineAddress,
        abi: ABIS.PerpEngine,
        functionName: 'getFundBalances',
      });

      const [trade, insurance, protocol] = result as [bigint, bigint, bigint];
      return { trade, insurance, protocol };
    } catch (error: any) {
      const contractError = decodeContractError(error, ABIS.PerpEngine);
      throw new Error(contractError.message);
    }
  }

  async getMarketAddress(engineAddress: Address): Promise<Address> {
    try {
      const marketAddress = await this.publicClient.readContract({
        address: engineAddress,
        abi: ABIS.PerpEngine,
        functionName: 'market',
      });

      return marketAddress as Address;
    } catch (error: any) {
      const contractError = decodeContractError(error, ABIS.PerpEngine);
      throw new Error(contractError.message);
    }
  }

  async getPositionManagerAddress(engineAddress: Address): Promise<Address> {
    try {
      const positionManagerAddress = await this.publicClient.readContract({
        address: engineAddress,
        abi: ABIS.PerpEngine,
        functionName: 'positionManager',
      });

      return positionManagerAddress as Address;
    } catch (error: any) {
      const contractError = decodeContractError(error, ABIS.PerpEngine);
      throw new Error(contractError.message);
    }
  }

  /**
   * Aggregated market data helper
   */
  async getFullMarketData(engineAddress: Address): Promise<MarketData> {
    try {
      const marketAddress = await this.getMarketAddress(engineAddress);

      const [
        baseReserve,
        quoteReserve,
        markPrice,
        longOI,
        shortOI,
        carryIndex,
        lastFundingBlock,
        currentBlock,
        fundBalances,
      ] = await Promise.all([
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
          functionName: 'getMarkPrice',
        }),
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
        this.getFundBalances(engineAddress),
      ]);

      const netOI = (longOI as bigint) - (shortOI as bigint);

      return {
        marketAddress,
        baseReserve: baseReserve as bigint,
        quoteReserve: quoteReserve as bigint,
        markPrice: markPrice as bigint,
        longOI: longOI as bigint,
        shortOI: shortOI as bigint,
        netOI,
        carryIndex: carryIndex as bigint,
        currentBlock: currentBlock as bigint,
        lastFundingBlock: lastFundingBlock as bigint,
        tradeFund: fundBalances.trade,
        insuranceFund: fundBalances.insurance,
        protocolFees: fundBalances.protocol,
        timestamp: Date.now(),
      };
    } catch (error: any) {
      const contractError = decodeContractError(error, ABIS.PerpEngine);
      throw new Error(contractError.message);
    }
  }
}
