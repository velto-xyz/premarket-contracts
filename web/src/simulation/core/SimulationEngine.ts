import { createWalletClient, createPublicClient, http, type PublicClient, type Address } from 'viem';
import { anvil } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { ContractService } from '../../contract-api';
import { BotAgent } from '../bots/BotAgent';
import { useSimulationStore, type BotWallet } from '../store/simulationStore';
import { SCENARIOS, pickStrategy } from '../scenarios';
import type { MarketData } from '../../contract-api';

// Anvil default accounts 5-9 for bots (with private keys)
// These are publicly known test accounts - NEVER use in production
const BOT_ACCOUNTS = [
  {
    index: 5,
    address: '0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc' as `0x${string}`,
    privateKey: '0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba' as `0x${string}`,
  },
  {
    index: 6,
    address: '0x976EA74026E726554dB657fA54763abd0C3a0aa9' as `0x${string}`,
    privateKey: '0x92db14e403b83dfe3df233f83dfa3a0d7096f21ca9b0d6d6b8d88b2b4ec1564e' as `0x${string}`,
  },
  {
    index: 7,
    address: '0x14dC79964da2C08b23698B3D3cc7Ca32193d9955' as `0x${string}`,
    privateKey: '0x4bbbf85ce3377467afe5d46f804f221813b2bb87f24d81f60f1fcdbf7cbf4356' as `0x${string}`,
  },
  {
    index: 8,
    address: '0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f' as `0x${string}`,
    privateKey: '0xdbda1821b80551c9d65939329250298aa3472ba22feea921c0cf5d620ea67b97' as `0x${string}`,
  },
  {
    index: 9,
    address: '0xa0Ee7A142d267C1f36714E4a8F75612F20a79720' as `0x${string}`,
    privateKey: '0x2a871d0798f97d79848a013d4936a73bf4cc922c825d33c1cf7073dff6d409c6' as `0x${string}`,
  },
];

/**
 * SimulationEngine: Orchestrates the entire simulation
 * - Manages bot lifecycle
 * - Executes simulation loop
 * - Advances Anvil blocks
 * - Coordinates trades
 * - Updates statistics
 */
export class SimulationEngine {
  private bots: BotAgent[] = [];
  private publicClient: PublicClient | null = null;
  private contractService: ContractService | null = null;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private currentBlock: number = 0;
  private priceHistory: number[] = [];
  private isInitialized: boolean = false;

  private engineAddress: Address;

  constructor(engineAddress: Address) {
    this.engineAddress = engineAddress;
  }

  /**
   * Initialize simulation: create clients, fund bots, etc.
   */
  async initialize(): Promise<boolean> {
    try {
      console.log('🎮 Initializing simulation engine...');

      // Create public client
      this.publicClient = createPublicClient({
        chain: anvil,
        transport: http('http://127.0.0.1:8545'),
      });

      // Get scenario config
      const { config } = useSimulationStore.getState();
      const scenario = SCENARIOS[config.scenario];

      // Create bots based on scenario
      console.log(`Creating ${config.botCount} bots for scenario: ${scenario.name}`);

      this.bots = [];
      const botWallets: BotWallet[] = [];

      for (let i = 0; i < Math.min(config.botCount, BOT_ACCOUNTS.length); i++) {
        const account = BOT_ACCOUNTS[i];
        const strategyType = pickStrategy(scenario.strategyWeights);

        // Create wallet client for this bot using its private key
        const botAccount = privateKeyToAccount(account.privateKey);
        const botWalletClient = createWalletClient({
          account: botAccount,
          chain: anvil,
          transport: http('http://127.0.0.1:8545'),
        });

        const bot = new BotAgent(
          i,
          account.address,
          account.index,
          strategyType,
          botWalletClient,
          this.publicClient
        );
        this.bots.push(bot);

        botWallets.push({
          address: account.address,
          accountIndex: account.index,
          balance: 0n,
          activePositions: [],
        });

        console.log(`  Bot ${i}: ${account.address.slice(0, 10)}... (${strategyType})`);
      }

      // Save bot wallets to store
      useSimulationStore.getState().setBotWallets(botWallets);

      // Fund bots: mint USDC, approve, and deposit
      await this.fundBots();

      // Get current block
      this.currentBlock = Number(await this.publicClient.getBlockNumber());

      this.isInitialized = true;
      console.log('✅ Simulation engine initialized');
      return true;
    } catch (error) {
      console.error('Failed to initialize simulation:', error);
      return false;
    }
  }

  /**
   * Fund all bot wallets: mint USDC, approve, and deposit to engine
   */
  private async fundBots(): Promise<void> {
    if (!this.publicClient) return;

    console.log('💰 Funding bot wallets...');

    const initialUSDC = 10_000n * 10n ** 6n; // 10k USDC in 6 decimals

    for (const bot of this.bots) {
      try {
        console.log(`  Funding bot ${bot.id}...`);

        // Step 1: Mint USDC to bot wallet
        console.log(`    - Minting ${initialUSDC} USDC...`);
        const mintResult = await bot.service.usdc.mint(bot.walletAddress, initialUSDC * 2n);
        console.log(`    ✓ Minted USDC (tx: ${mintResult.txHash})`);

        // Step 2: Approve engine to spend USDC
        console.log(`    - Approving engine...`);
        const approveResult = await bot.service.usdc.approve(this.engineAddress, initialUSDC);
        console.log(`    ✓ Approved (tx: ${approveResult.txHash})`);

        // Step 3: Deposit USDC to engine
        console.log(`    - Depositing to engine...`);
        const depositResult = await bot.service.engine.deposit(this.engineAddress, initialUSDC);
        console.log(`    ✓ Deposited (tx: ${depositResult.txHash})`);

        // Update bot balance in store
        const balance = await bot.service.engine.getWalletBalance(
          this.engineAddress,
          bot.walletAddress
        );

        const botWallets = useSimulationStore.getState().botWallets;
        const updated = botWallets.map((w) =>
          w.address === bot.walletAddress ? { ...w, balance } : w
        );
        useSimulationStore.getState().setBotWallets(updated);

        console.log(`  ✅ Bot ${bot.id} funded: ${bot.walletAddress.slice(0, 10)}...`);
      } catch (error) {
        console.error(`Failed to fund bot ${bot.id}:`, error);
      }
    }

    console.log('✅ All bots funded');
  }

  /**
   * Start simulation loop
   */
  start(): void {
    if (!this.isInitialized) {
      console.error('Simulation not initialized. Call initialize() first.');
      return;
    }

    const { config } = useSimulationStore.getState();
    const tickInterval = 1000 / config.speedMultiplier; // Base 1 second, adjusted by speed

    console.log(`🎬 Starting simulation at ${config.speedMultiplier}x speed`);

    this.intervalId = setInterval(() => {
      this.tick();
    }, tickInterval);
  }

  /**
   * Pause simulation
   */
  pause(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('⏸️  Simulation paused');
    }
  }

  /**
   * Stop and cleanup simulation
   */
  async stop(): Promise<void> {
    this.pause();

    this.bots = [];
    this.isInitialized = false;
    this.priceHistory = [];
    console.log('🛑 Simulation stopped');
  }

  /**
   * Main simulation tick
   */
  private async tick(): Promise<void> {
    if (!this.publicClient || !this.engineAddress) return;

    try {
      const { config } = useSimulationStore.getState();
      const scenario = SCENARIOS[config.scenario];

      // Advance Anvil blocks
      await this.advanceBlocks(scenario.blockAdvanceRate);

      // Update price history from market data
      // This would ideally come from useMarketData, but for now we'll fetch directly
      // In real implementation, this should be injected

      // Each bot decides and executes
      for (const bot of this.bots) {
        await this.executeBotTurn(bot, scenario);
      }
    } catch (error) {
      console.error('Simulation tick error:', error);
    }
  }

  /**
   * Advance Anvil blockchain
   */
  private async advanceBlocks(count: number): Promise<void> {
    if (!this.publicClient) return;

    try {
      await this.publicClient.request({
        method: 'anvil_mine' as any,
        params: [count] as any,
      });

      this.currentBlock += count;
      useSimulationStore.getState().incrementBlocks(count);
    } catch (error) {
      console.error('Failed to advance blocks:', error);
    }
  }

  /**
   * Execute one bot's turn
   */
  private async executeBotTurn(bot: BotAgent, scenario: any): Promise<void> {
    if (!this.engineAddress) return;

    try {
      // Get actual market state from contract
      const marketData = await bot.service.engine.getFullMarketData(this.engineAddress);

      const marketState = {
        markPrice: marketData.markPrice,
        baseReserve: marketData.baseReserve,
        quoteReserve: marketData.quoteReserve,
        longOI: marketData.longOI,
        shortOI: marketData.shortOI,
        priceHistory: this.priceHistory,
      };

      // Get bot's current balance
      const botBalance = await bot.service.engine.getWalletBalance(
        this.engineAddress,
        bot.walletAddress
      );

      const decision = bot.decide(marketState, botBalance, this.currentBlock, {
        positionSizeRange: scenario.positionSize,
        leverageRange: scenario.leverage,
        longShortRatio: scenario.longShortRatio,
      });

      if (decision.action === 'hold') {
        return;
      }

      // Execute action using bot's service
      if (decision.action === 'open') {
        const result = await bot.executeOpen(
          this.engineAddress,
          decision.isLong!,
          decision.size!,
          decision.leverage!
        );

        if (result.success) {
          console.log(`✅ Bot ${bot.id} opened position ${result.positionId}`);
          useSimulationStore.getState().incrementTrades();
          if (result.positionId) {
            bot.addPosition(result.positionId, this.currentBlock);
          }
        } else {
          console.error(`❌ Bot ${bot.id} failed to open position:`, result.error);
        }
      } else if (decision.action === 'close' && decision.positionToClose) {
        const result = await bot.executeClose(
          this.engineAddress,
          decision.positionToClose
        );

        if (result.success) {
          console.log(`✅ Bot ${bot.id} closed position ${decision.positionToClose}`);
          useSimulationStore.getState().incrementTrades();
          bot.removePosition(decision.positionToClose);
        } else {
          console.error(`❌ Bot ${bot.id} failed to close position:`, result.error);
        }
      }
    } catch (error) {
      console.error(`Error executing bot ${bot.id} turn:`, error);
    }
  }

  /**
   * Inject market data for bot decisions
   */
  updateMarketData(data: MarketData): void {
    const price = Number(data.markPrice) / 1e18;
    this.priceHistory.push(price);

    // Keep last 50 prices
    if (this.priceHistory.length > 50) {
      this.priceHistory.shift();
    }
  }
}
