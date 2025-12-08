/**
 * Contract addresses configuration
 * Known USDC addresses are hardcoded, deployed addresses come from deployments.json
 */

import deployments from '../../../deployments.json';

// Known USDC addresses on public networks
const KNOWN_USDC: Record<number, string> = {
  // Mainnets
  1: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',        // Ethereum
  8453: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',     // Base
  10: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',       // Optimism
  42161: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',    // Arbitrum One
  137: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',      // Polygon

  // Testnets
  11155111: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',  // Sepolia
  84532: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',     // Base Sepolia
  11155420: '0x5fd84259d66Cd46123540766Be93DFE6D43130D7', // Optimism Sepolia
  421614: '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d',   // Arbitrum Sepolia
};

// Build address maps from deployments.json
export const USDC_ADDRESSES: Record<number, string> = Object.entries(deployments as Record<string, any>).reduce((acc, [chainId, deployment]) => {
  const id = parseInt(chainId);
  acc[id] = deployment.usdc || KNOWN_USDC[id] || '';
  return acc;
}, { ...KNOWN_USDC });

export const FACTORY_ADDRESSES: Record<number, string> = Object.entries(deployments as Record<string, any>).reduce((acc, [chainId, deployment]) => {
  acc[parseInt(chainId)] = deployment.factory || '';
  return acc;
}, {} as Record<number, string>);

export const LIQUIDATION_ENGINE_ADDRESSES: Record<number, string> = Object.entries(deployments as Record<string, any>).reduce((acc, [chainId, deployment]) => {
  acc[parseInt(chainId)] = deployment.liquidationEngine || '';
  return acc;
}, {} as Record<number, string>);

export const FUNDING_MANAGER_ADDRESSES: Record<number, string> = Object.entries(deployments as Record<string, any>).reduce((acc, [chainId, deployment]) => {
  acc[parseInt(chainId)] = deployment.fundingManager || '';
  return acc;
}, {} as Record<number, string>);

/**
 * Get contract addresses for a given chain
 */
export function getAddresses(chainId: number) {
  return {
    usdc: USDC_ADDRESSES[chainId],
    factory: FACTORY_ADDRESSES[chainId],
    liquidationEngine: LIQUIDATION_ENGINE_ADDRESSES[chainId],
    fundingManager: FUNDING_MANAGER_ADDRESSES[chainId],
  };
}

/**
 * Check if a chain is supported
 */
export function isChainSupported(chainId: number): boolean {
  return !!USDC_ADDRESSES[chainId] && !!FACTORY_ADDRESSES[chainId];
}

/**
 * Get network name for a chain ID
 */
export function getNetworkName(chainId: number): string {
  const names: Record<number, string> = {
    1: 'Ethereum',
    8453: 'Base',
    10: 'Optimism',
    42161: 'Arbitrum',
    137: 'Polygon',
    11155111: 'Sepolia',
    84532: 'Base Sepolia',
    11155420: 'Optimism Sepolia',
    421614: 'Arbitrum Sepolia',
    31337: 'Local',
  };
  return names[chainId] || `Chain ${chainId}`;
}
