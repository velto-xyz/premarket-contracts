#!/usr/bin/env node

/**
 * Liquidation Keeper Bot
 *
 * Monitors perpetual futures positions and liquidates unhealthy ones
 *
 * Features:
 * - Polls every block for new positions and health checks
 * - Tracks all open positions in memory
 * - Liquidates positions when they become unhealthy
 * - Simple profitability check: liquidation fee > gas cost
 */

import { ethers } from 'ethers';
import dotenv from 'dotenv';

dotenv.config();

// Configuration
const config = {
  rpcUrl: process.env.RPC_URL || 'http://127.0.0.1:8545',
  privateKey: process.env.PRIVATE_KEY,
  engineAddress: process.env.ENGINE_ADDRESS,
  positionManagerAddress: process.env.POSITION_MANAGER_ADDRESS,
  liquidationEngineAddress: process.env.LIQUIDATION_ENGINE_ADDRESS,
  pollInterval: parseInt(process.env.POLL_INTERVAL || '12000'), // 12 seconds default
  minLiquidationProfit: ethers.parseUnits(process.env.MIN_PROFIT || '1', 6), // 1 USDC minimum profit
};

// Validate configuration
if (!config.privateKey) {
  console.error('ERROR: PRIVATE_KEY not set in environment');
  process.exit(1);
}

if (!config.engineAddress) {
  console.error('ERROR: ENGINE_ADDRESS not set in environment');
  process.exit(1);
}

// Setup provider and wallet
const provider = new ethers.JsonRpcProvider(config.rpcUrl);
const wallet = new ethers.Wallet(config.privateKey, provider);

console.log('🤖 Liquidation Keeper Bot Starting...');
console.log('Keeper address:', wallet.address);
console.log('Engine address:', config.engineAddress);
console.log('RPC URL:', config.rpcUrl);
console.log('Poll interval:', config.pollInterval, 'ms');

// ABIs (minimal, only what we need)
const ENGINE_ABI = [
  'event PositionOpened(uint256 indexed positionId, address indexed user, bool indexed isLong, uint256 totalToUse, uint256 margin, uint256 fee, uint256 leverage, uint256 baseSize, uint256 entryPrice)',
  'event PositionClosed(uint256 indexed positionId, address indexed user, int256 totalPnl, uint256 avgClosePrice)',
  'event PositionLiquidated(uint256 indexed positionId, address indexed user, address indexed liquidator, uint256 liqFee)',
  'function liquidate(uint256 positionId) external',
];

const POSITION_MANAGER_ABI = [
  'function isPositionOpen(uint256 positionId) external view returns (bool)',
  'function getPosition(uint256 positionId) external view returns (tuple(uint256 id, address user, bool isLong, uint256 baseSize, uint256 entryPrice, uint256 entryNotional, uint256 margin, int256 carrySnapshot, uint256 openBlock, uint8 status, int256 realizedPnl))',
];

const LIQUIDATION_ENGINE_ABI = [
  'function isLiquidatable(uint256 positionId) external view returns (bool)',
  'function getLiquidationInfo(uint256 positionId) external view returns (bool isLiq, uint256 currentLoss, uint256 allowedLoss, int256 equity, uint256 leverage)',
  'function calculateLiquidationFee(uint256 positionId) external view returns (uint256 liqFee)',
];

// Contract instances
const engine = new ethers.Contract(config.engineAddress, ENGINE_ABI, wallet);
const positionManager = config.positionManagerAddress
  ? new ethers.Contract(config.positionManagerAddress, POSITION_MANAGER_ABI, provider)
  : null;
const liquidationEngine = config.liquidationEngineAddress
  ? new ethers.Contract(config.liquidationEngineAddress, LIQUIDATION_ENGINE_ABI, provider)
  : null;

// State
const trackedPositions = new Set();
let lastProcessedBlock = 0;

/**
 * Listen for new positions being opened
 */
async function setupEventListeners() {
  console.log('📡 Setting up event listeners...');

  // Listen for new positions
  engine.on('PositionOpened', (positionId, user, isLong, totalToUse, margin, fee, leverage, baseSize, entryPrice, event) => {
    console.log(`\n✅ New position opened:`);
    console.log(`  Position ID: ${positionId}`);
    console.log(`  User: ${user}`);
    console.log(`  Side: ${isLong ? 'LONG' : 'SHORT'}`);
    console.log(`  Leverage: ${ethers.formatUnits(leverage, 18)}x`);
    console.log(`  Margin: ${ethers.formatUnits(margin, 18)} USDC`);

    trackedPositions.add(positionId.toString());
  });

  // Listen for positions being closed
  engine.on('PositionClosed', (positionId, user, totalPnl, avgClosePrice, event) => {
    console.log(`\n📕 Position closed: ${positionId}`);
    trackedPositions.delete(positionId.toString());
  });

  // Listen for liquidations (including by other keepers)
  engine.on('PositionLiquidated', (positionId, user, liquidator, liqFee, event) => {
    const isUs = liquidator.toLowerCase() === wallet.address.toLowerCase();
    console.log(`\n⚡ Position liquidated: ${positionId}`);
    console.log(`  Liquidator: ${liquidator} ${isUs ? '(US!)' : ''}`);
    console.log(`  Fee: ${ethers.formatUnits(liqFee, 18)} USDC`);

    trackedPositions.delete(positionId.toString());
  });

  console.log('✅ Event listeners active');
}

/**
 * Check if a position is liquidatable and if it's profitable to liquidate
 */
async function checkPosition(positionId) {
  try {
    // Check if still open
    if (positionManager) {
      const isOpen = await positionManager.isPositionOpen(positionId);
      if (!isOpen) {
        trackedPositions.delete(positionId.toString());
        return null;
      }
    }

    // Check if liquidatable
    if (!liquidationEngine) {
      console.warn('⚠️  LiquidationEngine not configured, skipping liquidation checks');
      return null;
    }

    const isLiquidatable = await liquidationEngine.isLiquidatable(positionId);

    if (!isLiquidatable) {
      return null; // Position is healthy
    }

    // Get liquidation info
    const [, currentLoss, allowedLoss, equity, leverage] =
      await liquidationEngine.getLiquidationInfo(positionId);

    const liqFee = await liquidationEngine.calculateLiquidationFee(positionId);

    // Estimate gas cost (rough estimate: 350k gas)
    const gasPrice = (await provider.getFeeData()).gasPrice;
    const estimatedGasCost = gasPrice * 350000n;

    // Convert to USDC equivalent (assuming gas token, need to adjust for different chains)
    // For simplicity, using a 1:1 ratio, but in production should fetch actual price
    const profitEstimate = liqFee - estimatedGasCost;

    const isProfitable = profitEstimate > config.minLiquidationProfit;

    return {
      positionId,
      isLiquidatable,
      isProfitable,
      liqFee,
      currentLoss,
      allowedLoss,
      equity,
      leverage,
      estimatedGasCost,
      profitEstimate,
    };
  } catch (error) {
    console.error(`Error checking position ${positionId}:`, error.message);
    return null;
  }
}

/**
 * Attempt to liquidate a position
 */
async function liquidatePosition(positionId, info) {
  try {
    console.log(`\n🔨 Attempting to liquidate position ${positionId}...`);
    console.log(`  Current loss: ${ethers.formatUnits(info.currentLoss, 18)}`);
    console.log(`  Allowed loss: ${ethers.formatUnits(info.allowedLoss, 18)}`);
    console.log(`  Liquidation fee: ${ethers.formatUnits(info.liqFee, 18)}`);
    console.log(`  Estimated profit: ${ethers.formatUnits(info.profitEstimate, 18)}`);

    // Estimate gas
    const gasEstimate = await engine.liquidate.estimateGas(positionId);
    console.log(`  Gas estimate: ${gasEstimate}`);

    // Execute liquidation
    const tx = await engine.liquidate(positionId, {
      gasLimit: gasEstimate * 120n / 100n, // 20% buffer
    });

    console.log(`  Transaction sent: ${tx.hash}`);
    console.log(`  Waiting for confirmation...`);

    const receipt = await tx.wait();

    console.log(`  ✅ Liquidation successful!`);
    console.log(`  Gas used: ${receipt.gasUsed}`);
    console.log(`  Block: ${receipt.blockNumber}`);

    trackedPositions.delete(positionId.toString());

    return true;
  } catch (error) {
    // Check if it's a revert with specific error
    if (error.message.includes('NotLiquidatable')) {
      console.log(`  ℹ️  Position no longer liquidatable (already liquidated by someone else?)`);
      trackedPositions.delete(positionId.toString());
    } else {
      console.error(`  ❌ Liquidation failed: ${error.message}`);
    }
    return false;
  }
}

/**
 * Main loop - check all tracked positions
 */
async function checkAllPositions() {
  if (trackedPositions.size === 0) {
    return;
  }

  console.log(`\n🔍 Checking ${trackedPositions.size} positions...`);

  const checks = Array.from(trackedPositions).map(async (positionId) => {
    const info = await checkPosition(positionId);

    if (!info) {
      return;
    }

    if (info.isLiquidatable) {
      console.log(`\n⚠️  Position ${positionId} is liquidatable!`);

      if (info.isProfitable) {
        await liquidatePosition(positionId, info);
      } else {
        console.log(`  ⏭️  Skipping - not profitable enough`);
        console.log(`  Estimated profit: ${ethers.formatUnits(info.profitEstimate, 18)} USDC`);
      }
    }
  });

  await Promise.all(checks);
}

/**
 * Historical sync - fetch past PositionOpened events
 */
async function syncHistoricalPositions() {
  console.log('🔄 Syncing historical positions...');

  try {
    const currentBlock = await provider.getBlockNumber();
    const fromBlock = Math.max(0, currentBlock - 10000); // Last ~10k blocks

    console.log(`  Fetching events from block ${fromBlock} to ${currentBlock}...`);

    const filter = engine.filters.PositionOpened();
    const events = await engine.queryFilter(filter, fromBlock, currentBlock);

    console.log(`  Found ${events.length} PositionOpened events`);

    // Add all to tracked positions
    events.forEach(event => {
      const positionId = event.args[0].toString();
      trackedPositions.add(positionId);
    });

    // Remove any that were closed
    const closedFilter = engine.filters.PositionClosed();
    const closedEvents = await engine.queryFilter(closedFilter, fromBlock, currentBlock);

    closedEvents.forEach(event => {
      const positionId = event.args[0].toString();
      trackedPositions.delete(positionId);
    });

    // Remove any that were liquidated
    const liqFilter = engine.filters.PositionLiquidated();
    const liqEvents = await engine.queryFilter(liqFilter, fromBlock, currentBlock);

    liqEvents.forEach(event => {
      const positionId = event.args[0].toString();
      trackedPositions.delete(positionId);
    });

    console.log(`  Currently tracking ${trackedPositions.size} open positions`);
    lastProcessedBlock = currentBlock;
  } catch (error) {
    console.error('Error syncing historical positions:', error);
  }
}

/**
 * Main function
 */
async function main() {
  try {
    // Check connection
    const network = await provider.getNetwork();
    console.log('Connected to network:', network.name, `(chainId: ${network.chainId})`);

    // Check keeper balance
    const balance = await provider.getBalance(wallet.address);
    console.log('Keeper balance:', ethers.formatEther(balance), 'ETH');

    if (balance === 0n) {
      console.warn('⚠️  WARNING: Keeper has 0 balance! Cannot send transactions.');
    }

    // Setup event listeners
    await setupEventListeners();

    // Sync historical positions
    await syncHistoricalPositions();

    // Start monitoring loop
    console.log('\n🚀 Keeper bot is now running...');
    console.log('Press Ctrl+C to stop\n');

    setInterval(async () => {
      await checkAllPositions();
    }, config.pollInterval);

  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n👋 Shutting down keeper bot...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n👋 Shutting down keeper bot...');
  process.exit(0);
});

// Start the bot
main().catch(console.error);
