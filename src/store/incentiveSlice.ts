import {
  ReservesIncentiveDataHumanized,
  UiIncentiveDataProvider,
  UserReservesIncentivesDataHumanized,
} from '@aave/contract-helpers';
import { StateCreator } from 'zustand';
import { RootStore } from './root';
import { getDerivedProtocolDataValues } from './protocolDataSlice';

// TODO: add chain/provider/account mapping
export interface IncentiveSlice {
  reserveIncentiveData?: ReservesIncentiveDataHumanized[];
  userIncentiveData?: UserReservesIncentivesDataHumanized[];
  refreshIncentiveData: () => Promise<void>;
}

export const createIncentiveSlice: StateCreator<
  RootStore,
  [['zustand/devtools', never], ['zustand/persist', unknown]],
  [],
  IncentiveSlice
> = (set, get) => ({
  refreshIncentiveData: async () => {
    const { currentMarketData, currentChainId, jsonRpcProvider } = getDerivedProtocolDataValues(
      get()
    );

    const account = get().account;
    if (!currentMarketData.addresses.UI_INCENTIVE_DATA_PROVIDER) return;
    const poolDataProviderContract = new UiIncentiveDataProvider({
      uiIncentiveDataProviderAddress: currentMarketData.addresses.UI_INCENTIVE_DATA_PROVIDER,
      provider: jsonRpcProvider,
      chainId: currentChainId,
    });
    const promises: Promise<void>[] = [];

    try {
      promises.push(
        poolDataProviderContract
          .getReservesIncentivesDataHumanized({
            lendingPoolAddressProvider: currentMarketData.addresses.LENDING_POOL_ADDRESS_PROVIDER,
          })
          .then((reserveIncentiveData) => set({ reserveIncentiveData }))
      );
      if (account) {
        promises.push(
          poolDataProviderContract
            .getUserReservesIncentivesDataHumanized({
              lendingPoolAddressProvider: currentMarketData.addresses.LENDING_POOL_ADDRESS_PROVIDER,
              user: account,
            })
            .then((userIncentiveData) =>
              set({
                userIncentiveData,
              })
            )
        );
      }
      await Promise.all(promises);
    } catch (e) {
      console.log('error fetching incentives');
    }
  },
});
