# Contracts SDK Setup (Recommended Approach)

Turn your contracts into a reusable NPM package that frontends can import.

## Structure

```
premarket-contracts/
  src/           # Solidity contracts
  sdk/           # TypeScript SDK
    package.json
    tsconfig.json
    src/
      index.ts
      abis.ts
      deployments.ts
      types.ts (generated)
```

## Setup Steps

### 1. Create SDK directory

```bash
cd premarket-contracts
mkdir -p sdk/src
```

### 2. Create `sdk/package.json`

```json
{
  "name": "@velto/contracts",
  "version": "1.0.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "files": ["dist"],
  "scripts": {
    "build": "tsc && node scripts/copy-abis.js",
    "prepublishOnly": "npm run build"
  },
  "dependencies": {
    "viem": "^2.0.0"
  },
  "devDependencies": {
    "@wagmi/cli": "^2.1.0",
    "typescript": "^5.0.0"
  }
}
```

### 3. Create `sdk/tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "declaration": true,
    "outDir": "./dist",
    "esModuleInterop": true,
    "strict": true
  },
  "include": ["src"]
}
```

### 4. Create `sdk/wagmi.config.ts`

```ts
import { defineConfig } from '@wagmi/cli'
import { foundry } from '@wagmi/cli/plugins'

export default defineConfig({
  out: 'src/generated.ts',
  plugins: [
    foundry({
      project: '..',
      include: [
        'PerpEngine.sol/**',
        'PerpMarket.sol/**',
        'PositionManager.sol/**',
        'PerpFactory.sol/**',
        'FundingManager.sol/**',
        'LiquidationEngine.sol/**',
        'MockUSDC.sol/**'
      ],
    }),
  ],
})
```

### 5. Create `sdk/src/index.ts`

```ts
// Export everything from generated types
export * from './generated'

// Export deployment addresses
export { getDeployment, getDeployments } from './deployments'

// Export utilities
export type { Address } from 'viem'
```

### 6. Create `sdk/src/deployments.ts`

```ts
import deployments from '../../deployments.json'
import type { Address } from 'viem'

export interface Deployment {
  factory: Address
  liquidationEngine: Address
  fundingManager: Address
  perpMarketImpl: Address
  positionManagerImpl: Address
  perpEngineImpl: Address
  deployer: Address
  usdc: Address
  timestamp: number
  deploymentBlock: number
}

export function getDeployment(chainId: number): Deployment | null {
  const deployment = deployments[chainId.toString() as keyof typeof deployments]
  return deployment as Deployment || null
}

export function getDeployments() {
  return deployments
}
```

### 7. Update root `package.json` to build SDK

```json
{
  "scripts": {
    "build": "forge build && cd sdk && npm run build",
    "publish:sdk": "cd sdk && npm publish"
  }
}
```

## Usage in Frontend

### Install (local development)

```bash
cd velto-unicorn-markets
npm install ../premarket-contracts/sdk
```

### Or publish to npm/GitHub packages

```bash
cd premarket-contracts
npm run publish:sdk
```

Then in frontend:
```bash
npm install @velto/contracts
```

### Use in code

```ts
// Before (manual imports)
import PerpEngineABI from '@/integrations/contract-api/abi/PerpEngine.json'
import deployments from '@/integrations/contract-api/deployments.json'

// After (SDK)
import { perpEngineAbi, getDeployment } from '@velto/contracts'

const deployment = getDeployment(31337)
const logs = await publicClient.getLogs({
  address: deployment.factory,
  abi: perpEngineAbi,
  eventName: 'PositionOpened'
})
```

## Benefits

✅ **Single Source of Truth** - Contracts repo owns types
✅ **Versioned** - Can pin SDK version in frontend
✅ **Shared** - Multiple frontends can use same SDK
✅ **Type Safe** - TypeScript types bundled with ABIs
✅ **No Manual Sync** - Just `npm install @velto/contracts@latest`
✅ **Standard Pattern** - Used by Uniswap, Aave, etc.

## Workflow

When contracts change:

```bash
cd premarket-contracts
forge build
cd sdk
npm run build
npm version patch  # or minor/major
npm publish

# In frontend
npm install @velto/contracts@latest
```

That's it! No manual copying, always in sync.
