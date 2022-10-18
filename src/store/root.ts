import { enableMapSet } from 'immer';
import create from 'zustand';
import { devtools, persist } from 'zustand/middleware';

import { createGovernanceSlice, GovernanceSlice } from './governanceSlice';
import { createIncentiveSlice, IncentiveSlice } from './incentiveSlice';
import { createPoolSlice, PoolSlice } from './poolSlice';
import { createProtocolDataSlice, ProtocolDataSlice } from './protocolDataSlice';
import { createStakeSlice, StakeSlice } from './stakeSlice';
import { createSingletonSubscriber } from './utils/createSingletonSubscriber';
import { createWalletSlice, WalletSlice } from './walletSlice';

enableMapSet();

export type RootStore = StakeSlice &
  ProtocolDataSlice &
  WalletSlice &
  PoolSlice &
  IncentiveSlice &
  GovernanceSlice;

export const useRootStore = create<RootStore>()(
  devtools(
    persist(
      (...args) => {
        return {
          ...createStakeSlice(...args),
          ...createProtocolDataSlice(...args),
          ...createWalletSlice(...args),
          ...createPoolSlice(...args),
          ...createIncentiveSlice(...args),
          ...createGovernanceSlice(...args),
          // ...createStakeSlice(...args),
          // ...createProtocolDataSlice(...args),
          // ...createWalletSlice(...args),
          // ...createIncentiveSlice(...args),
          // ...createGovernanceSlice(...args),
        };
      },
      {
        name: 'session-storage',
        partialize: () => ({
          // TODO: decide what to store, some values might be problematic as they rely on context
          // account: state.account,
          // currentMarketData: state.currentMarketData,
          // currentChainId: state.currentChainId,
        }),
      }
    )
  )
);

export const useStakeDataSubscription = createSingletonSubscriber(() => {
  return useRootStore.getState().refetchStakeData();
}, 60000);

export const useWalletBalancesSubscription = createSingletonSubscriber(() => {
  return useRootStore.getState().refetchWalletBalances();
}, 60000);

export const usePoolDataSubscription = createSingletonSubscriber(() => {
  return useRootStore.getState().refreshPoolData();
}, 60000);

export const useIncentiveDataSubscription = createSingletonSubscriber(() => {
  return useRootStore.getState().refreshIncentiveData();
}, 60000);

export const useGovernanceDataSubscription = createSingletonSubscriber(() => {
  return useRootStore.getState().refreshGovernanceData();
}, 60000);
