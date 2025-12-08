import { parseUnits, type PublicClient, type WalletClient, type Address } from 'viem';
import { ContractService } from '../../contract-api';
import { TradingStrategy, type MarketState, type BotState } from '../strategies/TradingStrategy';
import { RandomStrategy } from '../strategies/RandomStrategy';
import { MomentumStrategy } from '../strategies/MomentumStrategy';
import { MeanReversionStrategy } from '../strategies/MeanReversionStrategy';
import { FlashAttackStrategy } from '../strategies/FlashAttackStrategy';
import type { StrategyType } from '../scenarios';

/**
 * BotAgent: Autonomous trading agent
 * - Uses a specific trading strategy
 * - Executes trades via ContractService
 * - Manages own position state
 */
export class BotAgent {
  private strategy: TradingStrategy;
  private activePositions: bigint[] = [];
  private lastTradeBlock: number = 0;
  private cooldownBlocks: number = 2; // Minimum blocks between trades

  public readonly id: number;
  public readonly walletAddress: Address;
  public readonly accountIndex: number;
  public readonly service: ContractService;

  constructor(
    id: number,
    walletAddress: Address,
    accountIndex: number,
    strategyType: StrategyType,
    walletClient: WalletClient,
    publicClient: PublicClient,
    chainId: number = 31337 // Default to Anvil
  ) {
    this.id = id;
    this.walletAddress = walletAddress;
    this.accountIndex = accountIndex;

    // Initialize ContractService for this bot
    this.service = new ContractService(chainId, publicClient, walletClient);

    // Initialize strategy based on type
    switch (strategyType) {
      case 'random':
        this.strategy = new RandomStrategy();
        break;
      case 'momentum':
        this.strategy = new MomentumStrategy();
        break;
      case 'mean-reversion':
        this.strategy = new MeanReversionStrategy();
        break;
      case 'flash-attack':
        this.strategy = new FlashAttackStrategy();
        break;
      default:
        this.strategy = new RandomStrategy();
    }
  }

  /**
   * Get current bot state
   */
  getState(balance: bigint, currentBlock: number): BotState {
    const canTrade = currentBlock >= this.lastTradeBlock + this.cooldownBlocks;

    return {
      address: this.walletAddress,
      balance,
      activePositions: [...this.activePositions],
      canTrade,
    };
  }

  /**
   * Make trading decision based on strategy
   */
  decide(
    marketState: MarketState,
    botBalance: bigint,
    currentBlock: number,
    scenarioParams: {
      positionSizeRange: [number, number];
      leverageRange: [number, number];
      longShortRatio: number;
    }
  ) {
    const botState = this.getState(botBalance, currentBlock);
    return this.strategy.decide(marketState, botState, scenarioParams);
  }

  /**
   * Execute open position action
   */
  async executeOpen(
    engineAddress: Address,
    isLong: boolean,
    size: number, // USDC amount
    leverage: number
  ): Promise<{ success: boolean; positionId?: bigint; error?: string }> {
    try {
      // Convert to contract parameters (18 decimals)
      const totalToUse = parseUnits(size.toString(), 18);
      const leverageAmount = parseUnits(leverage.toString(), 18);

      // Execute via ContractService (includes simulation)
      const result = await this.service.engine.openPosition(
        engineAddress,
        isLong,
        totalToUse,
        leverageAmount
      );

      console.log(`✅ Bot ${this.id} opened position. Tx: ${result.txHash}`);
      return {
        success: true,
        positionId: result.positionId,
      };
    } catch (error: any) {
      console.error(`❌ Bot ${this.id} failed to open position:`, error.message);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Execute close position action
   */
  async executeClose(
    engineAddress: Address,
    positionId: bigint
  ): Promise<{ success: boolean; pnl?: bigint; error?: string }> {
    try {
      // Execute via ContractService (includes simulation)
      const result = await this.service.engine.closePosition(engineAddress, positionId);

      console.log(`✅ Bot ${this.id} closed position ${positionId}. Tx: ${result.txHash}`);

      // Remove from active positions
      this.activePositions = this.activePositions.filter((id) => id !== positionId);

      return {
        success: true,
        pnl: result.totalPnl,
      };
    } catch (error: any) {
      console.error(`❌ Bot ${this.id} failed to close position ${positionId}:`, error.message);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Add position to tracking
   */
  addPosition(positionId: bigint, currentBlock: number) {
    this.activePositions.push(positionId);
    this.lastTradeBlock = currentBlock;
  }

  /**
   * Remove position from tracking
   */
  removePosition(positionId: bigint) {
    this.activePositions = this.activePositions.filter((id) => id !== positionId);
  }

  /**
   * Get bot info for display
   */
  getInfo() {
    return {
      id: this.id,
      address: this.walletAddress,
      strategy: this.strategy.name,
      positionCount: this.activePositions.length,
    };
  }
}
