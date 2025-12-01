/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_USDC_ADDRESS: string;
  readonly VITE_FACTORY_ADDRESS: string;
  readonly VITE_ETH_ENGINE_ADDRESS: string;
  readonly VITE_BTC_ENGINE_ADDRESS: string;
  readonly VITE_SOL_ENGINE_ADDRESS: string;
  readonly VITE_CHAIN_ID: string;
  readonly VITE_RPC_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
