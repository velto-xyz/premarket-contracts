// Centralized contract ABIs and addresses
import {
  perpFactoryAbi,
  perpEngineAbi,
  perpMarketAbi,
  positionManagerAbi,
  fundingManagerAbi,
  liquidationEngineAbi,
  mockUsdcAbi,
  getDeployment,
} from '@velto/contracts';

export const ABIS = {
  PerpFactory: perpFactoryAbi,
  PerpEngine: perpEngineAbi,
  PerpMarket: perpMarketAbi,
  PositionManager: positionManagerAbi,
  FundingManager: fundingManagerAbi,
  LiquidationEngine: liquidationEngineAbi,
  MockUSDC: mockUsdcAbi,
} as const;

// Known USDC addresses on public networks (fallback)
const KNOWN_USDC: Record<number, string> = {
  1: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',        // Ethereum
  8453: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',     // Base
  10: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',       // Optimism
  42161: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',    // Arbitrum One
  137: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',      // Polygon
  11155111: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',  // Sepolia
  84532: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',     // Base Sepolia
  11155420: '0x5fd84259d66Cd46123540766Be93DFE6D43130D7', // Optimism Sepolia
  421614: '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d',   // Arbitrum Sepolia
};

/**
 * Get contract addresses for current chain
 * @param chainId Chain ID to get addresses for
 * @returns Contract addresses from deployments.json
 */
export const getContractAddresses = (chainId: number) => {
  const deployment = getDeployment(chainId);
  if (!deployment) {
    throw new Error(`No deployment found for chain ${chainId}`);
  }
  return {
    factory: deployment.factory,
    usdc: (deployment.usdc || KNOWN_USDC[chainId]) as `0x${string}`,
    liquidationEngine: deployment.liquidationEngine,
    fundingManager: deployment.fundingManager,
  };
};
