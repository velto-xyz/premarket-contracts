// Centralized contract ABIs and addresses
import PerpFactoryABI from '../lib/abi/PerpFactory.json';
import PerpEngineABI from '../lib/abi/PerpEngine.json';
import PerpMarketABI from '../lib/abi/PerpMarket.json';
import PositionManagerABI from '../lib/abi/PositionManager.json';
import FundingManagerABI from '../lib/abi/FundingManager.json';
import LiquidationEngineABI from '../lib/abi/LiquidationEngine.json';
import MockUSDCABI from '../lib/abi/MockUSDC.json';
import { getAddresses } from '../config/addresses';

export const ABIS = {
  PerpFactory: PerpFactoryABI.abi,
  PerpEngine: PerpEngineABI.abi,
  PerpMarket: PerpMarketABI.abi,
  PositionManager: PositionManagerABI.abi,
  FundingManager: FundingManagerABI.abi,
  LiquidationEngine: LiquidationEngineABI.abi,
  MockUSDC: MockUSDCABI.abi,
} as const;

/**
 * Get contract addresses for current chain
 * @param chainId Chain ID to get addresses for
 * @returns Contract addresses from deployments.json
 */
export const getContractAddresses = (chainId: number) => {
  const addresses = getAddresses(chainId);
  return {
    factory: addresses.factory as `0x${string}`,
    usdc: addresses.usdc as `0x${string}`,
    liquidationEngine: addresses.liquidationEngine as `0x${string}`,
    fundingManager: addresses.fundingManager as `0x${string}`,
  };
};
