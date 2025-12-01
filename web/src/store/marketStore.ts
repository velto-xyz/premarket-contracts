import { create } from 'zustand';

interface MarketStore {
  selectedMarket: string | null;
  setSelectedMarket: (address: string) => void;
}

export const useMarketStore = create<MarketStore>((set) => ({
  selectedMarket: null,
  setSelectedMarket: (address) => set({ selectedMarket: address }),
}));
