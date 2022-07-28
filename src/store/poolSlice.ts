import {
  FaucetService,
  LendingPool,
  Pool,
  PoolBaseCurrencyHumanized,
  PoolInterface,
  ReserveDataHumanized,
  UiPoolDataProvider,
  UserReserveDataHumanized,
} from '@aave/contract-helpers';
import { optimizedPath } from 'src/utils/utils';
import { StateCreator } from 'zustand';
import { RootStore } from './root';
import { getDerivedProtocolDataValues } from './protocolDataSlice';

// TODO: add chain/provider/account mapping
export interface PoolSlice {
  reserves?: { [chainId: number]: { [address: string]: ReserveDataHumanized[] } };
  baseCurrencyData?: { [chainId: number]: { [address: string]: PoolBaseCurrencyHumanized } };
  userReserves?: { [chainId: number]: { [address: string]: UserReserveDataHumanized[] } };
  userEmodeCategoryId?: { [chainId: number]: { [address: string]: number } };
  refreshPoolData: () => Promise<void>;
  computed: {
    get currentUserReserves(): UserReserveDataHumanized[];
    get currentUserEmodeCategoryId(): number;
    get currentReserves(): ReserveDataHumanized[];
    get currentBaseCurrencyData(): PoolBaseCurrencyHumanized;
  };
  // methods
  mint: FaucetService['mint'];
  withdraw: Pool['withdraw'];
  borrow: Pool['borrow'];
  setUsageAsCollateral: Pool['setUsageAsCollateral'];
}

export const createPoolSlice: StateCreator<
  RootStore,
  [['zustand/devtools', never], ['zustand/persist', unknown]],
  [],
  PoolSlice
> = (set, get) => {
  function getCorrectPool() {
    const { currentMarketData, jsonRpcProvider } = getDerivedProtocolDataValues(get());
    if (currentMarketData.v3) {
      return new Pool(jsonRpcProvider, {
        POOL: currentMarketData.addresses.LENDING_POOL,
        REPAY_WITH_COLLATERAL_ADAPTER: currentMarketData.addresses.REPAY_WITH_COLLATERAL_ADAPTER,
        SWAP_COLLATERAL_ADAPTER: currentMarketData.addresses.SWAP_COLLATERAL_ADAPTER,
        WETH_GATEWAY: currentMarketData.addresses.WETH_GATEWAY,
        L2_ENCODER: currentMarketData.addresses.L2_ENCODER,
      });
    } else {
      return new LendingPool(jsonRpcProvider, {
        LENDING_POOL: currentMarketData.addresses.LENDING_POOL,
        REPAY_WITH_COLLATERAL_ADAPTER: currentMarketData.addresses.REPAY_WITH_COLLATERAL_ADAPTER,
        SWAP_COLLATERAL_ADAPTER: currentMarketData.addresses.SWAP_COLLATERAL_ADAPTER,
        WETH_GATEWAY: currentMarketData.addresses.WETH_GATEWAY,
      });
    }
  }
  return {
    computed: {
      get currentUserEmodeCategoryId() {
        const { currentMarketData, currentChainId } = getDerivedProtocolDataValues(get());
        return (
          get()?.userEmodeCategoryId?.[currentChainId]?.[
            currentMarketData.addresses.LENDING_POOL_ADDRESS_PROVIDER
          ] || 0
        );
      },
      get currentUserReserves() {
        const { currentMarketData, currentChainId } = getDerivedProtocolDataValues(get());
        return (
          get()?.userReserves?.[currentChainId]?.[
            currentMarketData.addresses.LENDING_POOL_ADDRESS_PROVIDER
          ] || []
        );
      },
      get currentReserves() {
        const { currentMarketData, currentChainId } = getDerivedProtocolDataValues(get());
        return (
          get()?.reserves?.[currentChainId]?.[
            currentMarketData.addresses.LENDING_POOL_ADDRESS_PROVIDER
          ] || []
        );
      },
      get currentBaseCurrencyData() {
        const { currentMarketData, currentChainId } = getDerivedProtocolDataValues(get());
        return (
          get()?.baseCurrencyData?.[currentChainId]?.[
            currentMarketData.addresses.LENDING_POOL_ADDRESS_PROVIDER
          ] || {
            marketReferenceCurrencyDecimals: 0,
            marketReferenceCurrencyPriceInUsd: '0',
            networkBaseTokenPriceInUsd: '0',
            networkBaseTokenPriceDecimals: 0,
          }
        );
      },
    },
    refreshPoolData: async () => {
      const { currentMarketData, jsonRpcProvider, currentChainId } = getDerivedProtocolDataValues(
        get()
      );

      const account = get().account;
      const poolDataProviderContract = new UiPoolDataProvider({
        uiPoolDataProviderAddress: currentMarketData.addresses.UI_POOL_DATA_PROVIDER,
        provider: jsonRpcProvider,
        chainId: currentChainId,
      });
      const lendingPoolAddressProvider = currentMarketData.addresses.LENDING_POOL_ADDRESS_PROVIDER;
      const promises: Promise<void>[] = [];
      try {
        promises.push(
          poolDataProviderContract
            .getReservesHumanized({
              lendingPoolAddressProvider,
            })
            .then((reservesResponse) =>
              set((state) => ({
                reserves: {
                  ...state.reserves,
                  [currentChainId]: {
                    ...state.reserves?.[currentChainId],
                    [lendingPoolAddressProvider]: reservesResponse.reservesData,
                  },
                },
                baseCurrencyData: {
                  ...state.baseCurrencyData,
                  [currentChainId]: {
                    ...state.baseCurrencyData?.[currentChainId],
                    [lendingPoolAddressProvider]: reservesResponse.baseCurrencyData,
                  },
                },
              }))
            )
        );
        if (account) {
          promises.push(
            poolDataProviderContract
              .getUserReservesHumanized({
                lendingPoolAddressProvider,
                user: account,
              })
              .then((userReservesResponse) =>
                set((state) => ({
                  userReserves: {
                    ...state.userReserves,
                    [currentChainId]: {
                      ...state.userReserves?.[currentChainId],
                      [lendingPoolAddressProvider]: userReservesResponse.userReserves,
                    },
                  },
                  userEmodeCategoryId: {
                    ...state.userEmodeCategoryId,
                    [currentChainId]: {
                      ...state.userEmodeCategoryId?.[currentChainId],
                      [lendingPoolAddressProvider]: userReservesResponse.userEmodeCategoryId,
                    },
                  },
                }))
              )
          );
        }
        await Promise.all(promises);
      } catch (e) {
        console.log('error fetching pool data');
      }
    },
    // faucet
    mint: (...args) => {
      const { currentMarketData, jsonRpcProvider } = getDerivedProtocolDataValues(get());
      if (!currentMarketData.addresses.FAUCET)
        throw Error('currently selected market does not have a faucet attached');
      const service = new FaucetService(jsonRpcProvider, currentMarketData.addresses.FAUCET);
      return service.mint(...args);
    },
    // lending pool
    // TODO: might make sense to remove currentAccount from args and fetch it from store directly
    withdraw: (args) => {
      const { currentChainId } = getDerivedProtocolDataValues(get());
      const pool = getCorrectPool();
      return pool.withdraw({ ...args, useOptimizedPath: optimizedPath(currentChainId) });
    },
    borrow: (args) => {
      const { currentChainId } = getDerivedProtocolDataValues(get());
      const pool = getCorrectPool();
      return pool.borrow({ ...args, useOptimizedPath: optimizedPath(currentChainId) });
    },
    setUsageAsCollateral: (args) => {
      const { currentChainId } = getDerivedProtocolDataValues(get());
      const pool = getCorrectPool();
      return pool.setUsageAsCollateral({
        ...args,
        useOptimizedPath: optimizedPath(currentChainId),
      });
    },
  };
};
