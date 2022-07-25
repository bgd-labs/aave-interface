import { Trans } from '@lingui/macro';
import {
  Box,
  Grid,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { BigNumber } from 'ethers/lib/ethers';
import { formatEther } from 'ethers/lib/utils';
import { useEffect, useState } from 'react';
import { ContentContainer } from 'src/components/ContentContainer';
import { GetABPToken } from 'src/modules/staking/GetABPToken';
import { StakeModal } from 'src/components/transactions/Stake/StakeModal';
import { StakeCooldownModal } from 'src/components/transactions/StakeCooldown/StakeCooldownModal';
import { StakeRewardClaimModal } from 'src/components/transactions/StakeRewardClaim/StakeRewardClaimModal';
import { UnStakeModal } from 'src/components/transactions/UnStake/UnStakeModal';
import { useModalContext } from 'src/hooks/useModal';
import { MainLayout } from 'src/layouts/MainLayout';
import { StakingHeader } from 'src/modules/staking/StakingHeader';
import { StakingPanel } from 'src/modules/staking/StakingPanel';

import { ConnectWalletPaper } from '../src/components/ConnectWalletPaper';
import { useWeb3Context } from '../src/libs/hooks/useWeb3Context';
import { useRootStore, useStakeDataSubscription } from 'src/store/root';

export default function Staking() {
  const { currentAccount, loading } = useWeb3Context();
  const [stakeGeneralResult, stakeUserResult, stakeDataLoading] = useRootStore((state) => [
    state.stakeGeneralResult,
    state.stakeUserResult,
    state.stakeDataLoading,
  ]);
  useStakeDataSubscription();
  const { openStake, openStakeCooldown, openUnstake, openStakeRewardsClaim } = useModalContext();

  const { breakpoints } = useTheme();
  const lg = useMediaQuery(breakpoints.up('lg'));

  const [mode, setMode] = useState<'aave' | 'bpt' | ''>('');

  useEffect(() => {
    if (!mode) setMode('aave');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lg]);

  // Total funds at Safety Module (stkaave tvl + stkbpt tvl)
  const tvl = formatEther(
    BigNumber.from(stakeGeneralResult?.aave.stakeTokenTotalSupply || '0')
      .mul(stakeGeneralResult?.aave.stakeTokenPriceEth || '0')
      .add(
        BigNumber.from(stakeGeneralResult?.bpt.stakeTokenTotalSupply || '0').mul(
          stakeGeneralResult?.bpt.stakeTokenPriceEth || '0'
        )
      )
      .div(stakeGeneralResult?.usdPriceEth || 1)
  );

  // Total AAVE Emissions (stkaave dps + stkbpt dps)
  const stkEmission = formatEther(
    BigNumber.from(stakeGeneralResult?.aave.distributionPerSecond || '0')
      .add(stakeGeneralResult?.bpt.distributionPerSecond || '0')
      .mul('86400')
  );

  const isStakeAAVE = mode === 'aave';

  return (
    <>
      <StakingHeader tvl={tvl} stkEmission={stkEmission} loading={stakeDataLoading} />

      <ContentContainer>
        {currentAccount ? (
          <>
            <Box
              sx={{
                display: { xs: 'flex', lg: 'none' },
                justifyContent: { xs: 'center', xsm: 'flex-start' },
                mb: { xs: 3, xsm: 4 },
              }}
            >
              <ToggleButtonGroup
                color="primary"
                value={mode}
                exclusive
                onChange={(_, value) => setMode(value)}
                sx={{ width: { xs: '100%', xsm: '359px' } }}
              >
                <ToggleButton value="aave" disabled={mode === 'aave'}>
                  <Typography variant="subheader1">
                    <Trans>Stake AAVE</Trans>
                  </Typography>
                </ToggleButton>
                <ToggleButton value="bpt" disabled={mode === 'bpt'}>
                  <Typography variant="subheader1">
                    <Trans>Stake ABPT</Trans>
                  </Typography>
                </ToggleButton>
              </ToggleButtonGroup>
            </Box>

            <Grid container spacing={4}>
              <Grid
                item
                xs={12}
                lg={6}
                sx={{ display: { xs: !isStakeAAVE ? 'none' : 'block', lg: 'block' } }}
              >
                <StakingPanel
                  stakeTitle="AAVE"
                  stakedToken="AAVE"
                  maxSlash="0.3"
                  icon="aave"
                  stakeData={stakeGeneralResult?.aave}
                  stakeUserData={stakeUserResult?.aave}
                  ethUsdPrice={stakeGeneralResult?.usdPriceEth}
                  onStakeAction={() => openStake('aave', 'AAVE')}
                  onCooldownAction={() => openStakeCooldown('aave')}
                  onUnstakeAction={() => openUnstake('aave', 'AAVE')}
                  onStakeRewardClaimAction={() => openStakeRewardsClaim('aave')}
                />
              </Grid>
              <Grid
                item
                xs={12}
                lg={6}
                sx={{ display: { xs: isStakeAAVE ? 'none' : 'block', lg: 'block' } }}
              >
                <StakingPanel
                  stakeTitle="ABPT"
                  stakedToken="ABPT"
                  maxSlash="0.3"
                  icon="stkbpt"
                  stakeData={stakeGeneralResult?.bpt}
                  stakeUserData={stakeUserResult?.bpt}
                  ethUsdPrice={stakeGeneralResult?.usdPriceEth}
                  onStakeAction={() => openStake('bpt', 'stkBPT')}
                  onCooldownAction={() => openStakeCooldown('bpt')}
                  onUnstakeAction={() => openUnstake('bpt', 'stkBPT')}
                  onStakeRewardClaimAction={() => openStakeRewardsClaim('bpt')}
                  headerAction={<GetABPToken />}
                />
              </Grid>
            </Grid>
          </>
        ) : (
          <ConnectWalletPaper
            description={<Trans>We couldn’t detect a wallet. Connect a wallet to stake.</Trans>}
            loading={loading}
          />
        )}
      </ContentContainer>
    </>
  );
}

Staking.getLayout = function getLayout(page: React.ReactElement) {
  return (
    <MainLayout>
      {page}
      {/** Modals */}
      <StakeModal />
      <StakeCooldownModal />
      <UnStakeModal />
      <StakeRewardClaimModal />
      {/** End of modals */}
    </MainLayout>
  );
};
