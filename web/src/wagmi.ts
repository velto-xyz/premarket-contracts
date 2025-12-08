import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { http } from 'viem';
import { anvil, baseSepolia } from 'viem/chains';

export const config = getDefaultConfig({
  appName: 'Perp DEX',
  projectId: 'YOUR_PROJECT_ID',
  chains: [anvil, baseSepolia],
  transports: {
    [anvil.id]: http('http://127.0.0.1:8545'),
    [baseSepolia.id]: http(),
  },
});
