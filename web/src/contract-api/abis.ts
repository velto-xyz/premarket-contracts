// Centralized contract ABIs and addresses
import PerpFactoryABI from '../lib/abi/PerpFactory.json';
import PerpEngineABI from '../lib/abi/PerpEngine.json';
import PerpMarketABI from '../lib/abi/PerpMarket.json';
import PositionManagerABI from '../lib/abi/PositionManager.json';
import FundingManagerABI from '../lib/abi/FundingManager.json';
import LiquidationEngineABI from '../lib/abi/LiquidationEngine.json';
import MockUSDCABI from '../lib/abi/MockUSDC.json';

export const ABIS = {
  PerpFactory: PerpFactoryABI.abi,
  PerpEngine: PerpEngineABI.abi,
  PerpMarket: PerpMarketABI.abi,
  PositionManager: PositionManagerABI.abi,
  FundingManager: FundingManagerABI.abi,
  LiquidationEngine: LiquidationEngineABI.abi,
  MockUSDC: MockUSDCABI.abi,
} as const;

export const getContractAddresses = () => ({
  factory: import.meta.env.VITE_FACTORY_ADDRESS as `0x${string}`,
  engine: import.meta.env.VITE_ENGINE_ADDRESS as `0x${string}`,
  usdc: import.meta.env.VITE_USDC_ADDRESS as `0x${string}`,
});
