import type { PublicClient, WalletClient, Address } from 'viem';
import { MockUSDCService } from './MockUSDCService';
import { PerpEngineService } from './PerpEngineService';
import { PositionManagerService } from './PositionManagerService';
import { LiquidationEngineService } from './LiquidationEngineService';
import type { Position, PositionEquity, LiquidationInfo } from './types';

/**
 * Helper Service
 * High-level utilities for common workflows
 */
export class HelperService {
  constructor(
    private publicClient: PublicClient,
    private walletClient?: WalletClient,
    private usdc?: MockUSDCService,
    private engine?: PerpEngineService
  ) {}

  /**
   * Approve and deposit USDC in one call
   */
  async approveAndDeposit(engineAddress: Address, amount: bigint): Promise<{ txHash: string }> {
    if (!this.walletClient) throw new Error('Wallet client required');
    if (!this.usdc || !this.engine) throw new Error('Services not initialized');

    await this.usdc.approve(engineAddress, amount);
    return await this.engine.deposit(engineAddress, amount);
  }

  /**
   * Fund a bot with USDC from faucet and deposit to engine
   */
  async fundBot(engineAddress: Address): Promise<{ txHash: string; balance: bigint }> {
    if (!this.walletClient) throw new Error('Wallet client required');
    if (!this.usdc || !this.engine) throw new Error('Services not initialized');

    const account = this.walletClient.account;
    if (!account) throw new Error('No account connected');

    await this.usdc.faucet();

    const amount = 10_000n * 10n ** 6n; // 10k USDC in 6 decimals
    const result = await this.approveAndDeposit(engineAddress, amount);

    const balance = await this.engine.getWalletBalance(engineAddress, account.address);

    return { ...result, balance };
  }

  /**
   * Get comprehensive position analytics
   */
  async getPositionAnalytics(
    engineAddress: Address,
    positionId: bigint
  ): Promise<{
    position: Position;
    equity: PositionEquity;
    liquidationInfo: LiquidationInfo;
    isOpen: boolean;
  }> {
    if (!this.engine) throw new Error('Engine service not initialized');

    const positionManagerAddress = await this.engine.getPositionManagerAddress(engineAddress);
    const marketAddress = await this.engine.getMarketAddress(engineAddress);

    const positionManagerService = new PositionManagerService(this.publicClient);
    const liquidationEngineService = new LiquidationEngineService(this.publicClient);

    const [position, equity, liquidationInfo, isOpen] = await Promise.all([
      positionManagerService.getPosition(positionManagerAddress, positionId),
      positionManagerService.simulateEquityIfClosed(positionManagerAddress, positionId),
      liquidationEngineService.getLiquidationInfo(positionManagerAddress, marketAddress, positionId),
      positionManagerService.isPositionOpen(positionManagerAddress, positionId),
    ]);

    return { position, equity, liquidationInfo, isOpen };
  }
}
