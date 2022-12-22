import {
  InterestRate,
  PoolBaseCurrencyHumanized,
  ReserveDataHumanized,
  UserReserveDataHumanized,
  valueToWei,
} from '@aave/contract-helpers';
import { V3MigrationHelperSignedPermit } from '@aave/contract-helpers/dist/esm/v3-migration-contract/v3MigrationTypes';
import {
  formatReserves,
  FormatReserveUSDResponse,
  formatUserSummary,
  FormatUserSummaryResponse,
  rayDiv,
  rayMul,
  valueToBigNumber,
} from '@aave/math-utils';
import { SignatureLike } from '@ethersproject/bytes';
import { BigNumberish, constants } from 'ethers';

import {
  selectCurrentChainIdV2MarketData,
  selectCurrentChainIdV3MarketData,
  selectFormatBaseCurrencyData,
  selectNonEmptyUserBorrowPositions,
  selectUserNonEmtpySummaryAndIncentive,
  selectUserSummaryAndIncentives,
} from './poolSelectors';
import { RootStore } from './root';

export const selectIsolationModeForMigration = (
  store: RootStore,
  poolReserveV3Summary: Pick<
    FormatUserSummaryResponse<ReserveDataHumanized & FormatReserveUSDResponse>,
    'totalCollateralMarketReferenceCurrency' | 'isolatedReserve'
  >
) => {
  if (poolReserveV3Summary.totalCollateralMarketReferenceCurrency !== '0') {
    return poolReserveV3Summary.isolatedReserve;
  }
  return undefined;
};

export const selectMappedBorrowPositionsForMigration = (store: RootStore, timestamp: number) => {
  const borrowPositions = selectNonEmptyUserBorrowPositions(store, timestamp);
  const mappedBorrowPositions = borrowPositions.map((borrow) => {
    return {
      ...borrow,
      // TODO: make mapping for isolated borrowing here
      disabled: false,
    };
  });

  return mappedBorrowPositions;
};

export const selectUserReservesForMigration = (store: RootStore, timestamp: number) => {
  // initial v3 state
  const { userReservesData: userReserveV3Data, ...v3ReservesUserSummary } = selectV3UserSummary(
    store,
    timestamp
  );

  // initial v2 state
  const { userReservesData: userReservesV2Data, ...v2ReservesUserSummary } =
    selectUserSummaryAndIncentives(store, timestamp);

  const isolatedReserveV3 = selectIsolationModeForMigration(store, v3ReservesUserSummary);

  const v3ReservesMap = userReserveV3Data.reduce((obj, item) => {
    obj[item.underlyingAsset] = item;
    return obj;
  }, {} as Record<string, typeof userReserveV3Data[0]>);

  const supplyReserves = userReservesV2Data.filter(
    (userReserve) => userReserve.underlyingBalance !== '0'
  );

  const borrowReserves = userReservesV2Data.filter(
    (reserve) => reserve.variableBorrows != '0' || reserve.stableBorrows != '0'
  );
  // TODO: minor, (some of the logical branches here we can remove if we will start with usageAsCollateral false for all assets

  let assetsToProcess = supplyReserves.filter(() => false); // TODO: fix, should be empty array

  // all assets which are already deposited to v3 should have the same usageAsCollateral flag and user can't change it
  const supplyReservesFinal = supplyReserves.filter((userReserve) => {
    if (v3ReservesMap[userReserve.underlyingAsset].underlyingBalance != '0') {
      // TODO: set the same usage as collateral flag as on v3
      return true;
    }
    assetsToProcess.push(userReserve);
    return false;
  });

  // it seems that all assets user going to migrate are already on v3, nothing else to do
  if (!assetsToProcess.length) {
    // TODO: it's over, return
  }

  // if user already have some assets with usageAsCollateral true, then he can't define usage as collateral flags
  // but still we need to compute flags for assetsToProcess with respect to isolation mode
  if (userReserveV3Data.some((r) => r.usageAsCollateralEnabledOnUser)) {
    // if user has some isolated asset as collateral
    if (userReserveV3Data.some((r) => r.reserve.isIsolated && r.usageAsCollateralEnabledOnUser)) {
      // TODO: disable usage as collateral on all assetsToProcess except the isolated one, and move to supplyReservesFinal
      // also do not allow to change the enable/disable switch state
      supplyReservesFinal.push(
        ...assetsToProcess.map((r) => {
          // TODO: set usage as collateral to FALSE
          return r;
        })
      );
    } else {
      supplyReservesFinal.push(
        ...assetsToProcess.map((r) => {
          if (v3ReservesMap[r.underlyingAsset].reserve.isIsolated) {
            // TODO: set usage as collateral to FALSE
            return r;
          }
          // TODO: set usage as collateral to TRUE
          return r;
        })
      ); // why types broken...
    }
    assetsToProcess = [];
  } else {
    // normal == non isolated
    const anyNormalCollateral = assetsToProcess.some(
      (r) => !v3ReservesMap[r.underlyingAsset].reserve.isIsolated // TODO: or if one of them enforced ??
    );
    if (!anyNormalCollateral) {
      // TODO: set usage as collateral to TRUE for this asset before pushing
      supplyReservesFinal.push(assetsToProcess[0]);
      assetsToProcess.shift();
    }
    if (!assetsToProcess.length) {
      // TODO: it's over, return
    }
    // TODO: if we have any isolated enforced by user to true - set it to true, rest false
    // TODO: if we don't set all isolated to false, rest to true
  }

  const mappedSupplyReserves = supplyReserves.map((userReserve) => {
    // TODO: make dynamic mapping for enabled as collateral
    let usageAsCollateralEnabledOnUser = true;
    if (isolatedReserveV3) {
      usageAsCollateralEnabledOnUser =
        userReserve.underlyingAsset == isolatedReserveV3.underlyingAsset;
    } else {
      usageAsCollateralEnabledOnUser =
        !v3ReservesMap[userReserve.underlyingAsset]?.reserve.isIsolated;
    }
    return {
      ...userReserve,
      usageAsCollateralEnabledOnUser,
    };
  });

  const mappedBorrowReserves = borrowReserves.map((userReserve) => {
    // TOOD: make mapping for liquidity
    let disabledForMigration = false;
    if (isolatedReserveV3) {
      disabledForMigration =
        !v3ReservesMap[userReserve.underlyingAsset].reserve.borrowableInIsolation;
    }
    return {
      ...userReserve,
      disabledForMigration,
    };
  });

  return {
    ...v2ReservesUserSummary,
    borrowReserves: mappedBorrowReserves,
    supplyReserves: mappedSupplyReserves,
  };
};

export const selectedUserSupplyReservesForMigration = (store: RootStore, timestamp: number) => {
  const user = selectUserNonEmtpySummaryAndIncentive(store, timestamp);
  const selectedUserReserves = user.userReservesData.filter(
    (userReserve) => store.selectedMigrationSupplyAssets[userReserve.underlyingAsset]
  );
  return selectedUserReserves;
};

export const selectUserSupplyIncreasedReservesForMigrationPermits = (
  store: RootStore,
  timestamp: number
) => {
  return selectedUserSupplyReservesForMigration(store, timestamp).map((userReserve) => {
    const increasedAmount = addPercent(userReserve.underlyingBalance);
    const valueInWei = valueToWei(increasedAmount, userReserve.reserve.decimals);
    return { ...userReserve, increasedAmount: valueInWei };
  });
};

export const selectUserSupplyAssetsForMigrationNoPermit = (store: RootStore, timestamp: number) => {
  const selectedUserReserves = selectedUserSupplyReservesForMigration(store, timestamp);
  return selectedUserReserves.map(({ underlyingAsset, reserve }) => {
    const deadline = Math.floor(Date.now() / 1000 + 3600);
    return {
      amount: constants.MaxUint256.toString(),
      aToken: reserve.aTokenAddress,
      underlyingAsset: underlyingAsset,
      deadline,
    };
  });
};

export const selectUserSupplyAssetsForMigrationWithPermits = (
  store: RootStore,
  signatures: SignatureLike[],
  deadline: BigNumberish
): V3MigrationHelperSignedPermit[] => {
  return store.approvalPermitsForMigrationAssets.map(({ amount, underlyingAsset }, index) => {
    return {
      signedPermit: signatures[index],
      deadline,
      aToken: underlyingAsset,
      value: amount,
    };
  });
};

const addPercent = (amount: string) => {
  const convertedAmount = valueToBigNumber(amount);
  return convertedAmount.plus(convertedAmount.div(1000)).toString();
};

// adding  30 min of variable or either stable or variable debt APY similar to swap
// https://github.com/aave/interface/blob/main/src/hooks/useSwap.ts#L72-L78
const add1HourBorrowAPY = (amount: string, borrowAPY: string) => {
  const convertedAmount = valueToBigNumber(amount);
  const convertedBorrowAPY = valueToBigNumber(borrowAPY);
  return convertedAmount
    .plus(convertedAmount.multipliedBy(convertedBorrowAPY).dividedBy(360 * 48))
    .toString();
};

export const selectUserBorrowReservesForMigration = (store: RootStore, timestamp: number) => {
  const user = selectUserSummaryAndIncentives(store, timestamp);
  const selectedUserReserves = user.userReservesData
    // should filter for empty positions?
    .filter(
      (userReserve) =>
        valueToBigNumber(userReserve.stableBorrows).isGreaterThan(0) ||
        valueToBigNumber(userReserve.variableBorrows).isGreaterThan(0)
    )
    .filter((userReserve) => store.selectedMigrationBorrowAssets[userReserve.underlyingAsset])
    .map(({ reserve, ...userReserve }) => {
      const stableBorrows = valueToBigNumber(userReserve.stableBorrows);
      if (stableBorrows.isGreaterThan(0)) {
        const increasedAmount = add1HourBorrowAPY(
          userReserve.stableBorrows,
          reserve.stableBorrowAPY
        );
        return {
          ...userReserve,
          reserve,
          increasedAmount,
          interestRate: InterestRate.Stable,
        };
      }
      const increasedAmount = add1HourBorrowAPY(
        userReserve.variableBorrows,
        reserve.variableBorrowAPY
      );
      return {
        ...userReserve,
        reserve,
        increasedAmount,
        interestRate: InterestRate.Variable,
      };
    });

  return selectedUserReserves;
};

export const selectFormatUserSummaryForMigration = (
  reserves: ReserveDataHumanized[] = [],
  userReserves: UserReserveDataHumanized[] = [],
  baseCurrencyData: PoolBaseCurrencyHumanized,
  currentTimestamp: number,
  userEmodeCategoryId = 0
) => {
  const { marketReferenceCurrencyDecimals, marketReferenceCurrencyPriceInUsd } = baseCurrencyData;
  const formattedReserves = formatReserves({
    reserves: reserves,
    currentTimestamp,
    marketReferenceCurrencyDecimals: marketReferenceCurrencyDecimals,
    marketReferencePriceInUsd: marketReferenceCurrencyPriceInUsd,
  });

  const formattedSummary = formatUserSummary({
    currentTimestamp,
    formattedReserves,
    marketReferenceCurrencyDecimals: marketReferenceCurrencyDecimals,
    marketReferencePriceInUsd: marketReferenceCurrencyPriceInUsd,
    userReserves,
    userEmodeCategoryId,
  });

  return formattedSummary;
};

export const selectV2UserSummaryAfterMigration = (store: RootStore, currentTimestamp: number) => {
  const poolReserve = selectCurrentChainIdV2MarketData(store);

  const userReserves =
    poolReserve?.userReserves?.map((userReserve) => {
      let scaledATokenBalance = userReserve.scaledATokenBalance;
      let principalStableDebt = userReserve.principalStableDebt;
      let scaledVariableDebt = userReserve.scaledVariableDebt;

      const isSupplyAsset = store.selectedMigrationSupplyAssets[userReserve.underlyingAsset];
      if (isSupplyAsset) {
        scaledATokenBalance = '0';
      }
      const isBorrowAsset = store.selectedMigrationBorrowAssets[userReserve.underlyingAsset];
      if (isBorrowAsset) {
        principalStableDebt = '0';
        scaledVariableDebt = '0';
      }
      return {
        ...userReserve,
        principalStableDebt,
        scaledATokenBalance,
        scaledVariableDebt,
      };
    }) || [];

  const baseCurrencyData = selectFormatBaseCurrencyData(poolReserve);

  return selectFormatUserSummaryForMigration(
    poolReserve?.reserves,
    userReserves,
    baseCurrencyData,
    currentTimestamp,
    poolReserve?.userEmodeCategoryId
  );
};

export const selectV3UserSummaryAfterMigration = (store: RootStore, currentTimestamp: number) => {
  const poolReserveV3Summary = selectV3UserSummary(store, currentTimestamp);
  const poolReserveV3 = selectCurrentChainIdV3MarketData(store);

  const supplies = selectedUserSupplyReservesForMigration(store, currentTimestamp);
  const borrows = selectUserBorrowReservesForMigration(store, currentTimestamp);

  //TODO: refactor that to be more efficient
  const suppliesMap = supplies.concat(supplies).reduce((obj, item) => {
    obj[item.underlyingAsset] = item;
    return obj;
  }, {} as Record<string, typeof supplies[0]>);

  const borrowsMap = borrows.concat(borrows).reduce((obj, item) => {
    obj[item.underlyingAsset] = item;
    return obj;
  }, {} as Record<string, typeof borrows[0]>);

  const userReserves = poolReserveV3Summary.userReservesData.map((userReserveData) => {
    const borrowAsset = borrowsMap[userReserveData.underlyingAsset];
    const supplyAsset = suppliesMap[userReserveData.underlyingAsset];

    let combinedScaledDownVariableDebtV3 = userReserveData.scaledVariableDebt;
    let combinedScaledDownABalance = userReserveData.scaledATokenBalance;
    let usageAsCollateralEnabledOnUser = userReserveData.usageAsCollateralEnabledOnUser;
    // TODO: combine stable borrow amount as well
    if (borrowAsset && borrowAsset.interestRate == InterestRate.Variable) {
      const scaledDownVariableDebtV3 = valueToBigNumber(userReserveData.scaledVariableDebt);
      const variableBorrowIndexV3 = valueToBigNumber(userReserveData.reserve.variableBorrowIndex);
      const scaledDownVariableDebtV2Balance = rayDiv(
        valueToWei(borrowAsset.increasedAmount, userReserveData.reserve.decimals),
        variableBorrowIndexV3
      );
      combinedScaledDownVariableDebtV3 = scaledDownVariableDebtV3
        .plus(scaledDownVariableDebtV2Balance)
        .toString();
    }

    if (supplyAsset) {
      const scaledDownATokenBalance = valueToBigNumber(userReserveData.scaledATokenBalance);
      const liquidityIndexV3 = valueToBigNumber(userReserveData.reserve.liquidityIndex);
      const scaledDownBalanceV2 = rayDiv(
        valueToWei(supplyAsset.underlyingBalance, userReserveData.reserve.decimals),
        liquidityIndexV3
      );
      combinedScaledDownABalance = scaledDownATokenBalance.plus(scaledDownBalanceV2).toString();
      if (userReserveData.underlyingBalance == '0') {
        usageAsCollateralEnabledOnUser = userReserveData.reserve.isIsolated
          ? false
          : supplyAsset.usageAsCollateralEnabledOnUser;
      }
    }

    return {
      ...userReserveData,
      id: userReserveData.reserve.id,
      scaledVariableDebt: combinedScaledDownVariableDebtV3,
      scaledATokenBalance: combinedScaledDownABalance,
      usageAsCollateralEnabledOnUser,
    };
  });

  const baseCurrencyData = selectFormatBaseCurrencyData(poolReserveV3);

  const formattedUserSummary = selectFormatUserSummaryForMigration(
    poolReserveV3?.reserves,
    userReserves,
    baseCurrencyData,
    currentTimestamp,
    poolReserveV3?.userEmodeCategoryId
  );

  return formattedUserSummary;
};

export const selectV3UserSummary = (store: RootStore, timestamp: number) => {
  const poolReserveV3 = selectCurrentChainIdV3MarketData(store);
  const baseCurrencyData = selectFormatBaseCurrencyData(poolReserveV3);

  const formattedUserSummary = selectFormatUserSummaryForMigration(
    poolReserveV3?.reserves,
    poolReserveV3?.userReserves,
    baseCurrencyData,
    timestamp,
    poolReserveV3?.userEmodeCategoryId
  );
  return formattedUserSummary;
};

export const selectIsMigrationAvailable = (store: RootStore) => {
  return Boolean(store.currentMarketData.addresses.V3_MIGRATOR);
};
