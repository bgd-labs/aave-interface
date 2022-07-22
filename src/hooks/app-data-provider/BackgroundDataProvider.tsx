import React, { useContext } from 'react';
import {
  usePoolDataSubscription,
  useWalletBalancesSubscription,
  useIncentiveDataSubscription,
} from 'src/store/root';

interface BackgroundDataProviderContextType {
  refetchWalletBalances: () => Promise<void>;
  refetchIncentiveData?: () => Promise<void>;
  refetchPoolData?: () => Promise<void> | Promise<void[]>;
}

const BackgroundDataProviderContext = React.createContext<BackgroundDataProviderContextType>(
  {} as BackgroundDataProviderContextType
);

/**
 * Naive provider that subscribes to different data sources to update the apollo cache.
 * @param param0
 * @returns
 */
export const BackgroundDataProvider: React.FC = ({ children }) => {
  const refetchWalletBalances = useWalletBalancesSubscription();
  const refetchPoolData = usePoolDataSubscription();
  const refetchIncentiveData = useIncentiveDataSubscription();
  return (
    <BackgroundDataProviderContext.Provider
      value={{ refetchWalletBalances, refetchIncentiveData, refetchPoolData }}
    >
      {children}
    </BackgroundDataProviderContext.Provider>
  );
};

export const useBackgroundDataProvider = () => useContext(BackgroundDataProviderContext);
