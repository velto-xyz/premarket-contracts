import type { PublicClient, WalletClient } from 'viem';
import { MockUSDCService } from './MockUSDCService';
import { LiquidationEngineService } from './LiquidationEngineService';
import { PerpMarketService } from './PerpMarketService';
import { PositionManagerService } from './PositionManagerService';
import { FundingManagerService } from './FundingManagerService';
import { PerpEngineService } from './PerpEngineService';
import { PerpFactoryService } from './PerpFactoryService';
import { HelperService } from './helpers';

/**
 * Main Contract Service
 * Unified API for all contract interactions
 * Organized by contract grouping to match CONTRACTS_API.md
 */
export class ContractService {
  usdc: MockUSDCService;
  liquidationEngine: LiquidationEngineService;
  market: PerpMarketService;
  positionManager: PositionManagerService;
  fundingManager: FundingManagerService;
  engine: PerpEngineService;
  factory: PerpFactoryService;
  helpers: HelperService;

  constructor(
    publicClient: PublicClient,
    walletClient?: WalletClient
  ) {
    this.usdc = new MockUSDCService(publicClient, walletClient);
    this.liquidationEngine = new LiquidationEngineService(publicClient);
    this.market = new PerpMarketService(publicClient);
    this.positionManager = new PositionManagerService(publicClient);
    this.fundingManager = new FundingManagerService(publicClient);
    this.engine = new PerpEngineService(publicClient, walletClient);
    this.factory = new PerpFactoryService(publicClient, walletClient);
    this.helpers = new HelperService(publicClient, walletClient, this.usdc, this.engine);
  }
}

// Re-export types
export * from './types';
export * from './errors';
export * from './abis';

// Re-export individual services for advanced usage
export { MockUSDCService } from './MockUSDCService';
export { LiquidationEngineService } from './LiquidationEngineService';
export { PerpMarketService } from './PerpMarketService';
export { PositionManagerService } from './PositionManagerService';
export { FundingManagerService } from './FundingManagerService';
export { PerpEngineService } from './PerpEngineService';
export { PerpFactoryService } from './PerpFactoryService';
export { HelperService } from './helpers';
