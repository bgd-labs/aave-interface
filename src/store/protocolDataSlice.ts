import { CustomMarket } from '../ui-config/marketsConfig';
import { StateCreator } from 'zustand';
import {
  availableMarkets,
  getNetworkConfig,
  getProvider,
  marketsData,
} from 'src/utils/marketsAndNetworksConfig';
import { RootStore } from './root';
import { getQueryParameter, setQueryParameter } from './utils/queryParams';
import memoize from 'proxy-memoize';

export interface ProtocolDataSlice {
  currentMarket: CustomMarket;
  setCurrentMarket: (market: CustomMarket) => void;
}

export const createProtocolDataSlice: StateCreator<
  RootStore,
  [['zustand/devtools', never], ['zustand/persist', unknown]],
  [],
  ProtocolDataSlice
> = (set) => {
  const preselectedMarket = getQueryParameter('marketName') as CustomMarket;
  const initialMarket = availableMarkets.includes(preselectedMarket)
    ? preselectedMarket
    : availableMarkets[0]; // currently seeded with localStorage, but might not be necessary with persist
  return {
    currentMarket: initialMarket,
    setCurrentMarket: (market) => {
      setQueryParameter('marketName', market);
      set({
        currentMarket: market,
      });
    },
  };
};

/**
 * memoize only works partially here because jsonRpcProvider is not a plain object
 */
export const getDerivedProtocolDataValues = memoize((state: RootStore) => {
  const nextMarketData = marketsData[state.currentMarket];
  return {
    currentMarket: state.currentMarket,
    currentMarketData: nextMarketData,
    currentChainId: nextMarketData.chainId,
    currentNetworkConfig: getNetworkConfig(nextMarketData.chainId),
    jsonRpcProvider: getProvider(nextMarketData.chainId),
  };
});
