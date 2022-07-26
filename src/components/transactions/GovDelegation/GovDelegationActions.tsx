import { useTransactionHandler } from 'src/helpers/useTransactionHandler';
import { useWeb3Context } from 'src/libs/hooks/useWeb3Context';
import { Trans } from '@lingui/macro';
import { DelegationType } from 'src/helpers/types';
import { TxActionsWrapper } from '../TxActionsWrapper';
import { DelegationToken } from './DelegationTokenSelector';
import { useRootStore } from 'src/store/root';

export type GovDelegationActionsProps = {
  isWrongNetwork: boolean;
  blocked: boolean;
  delegationType: DelegationType;
  delegationToken?: DelegationToken;
  delegate: string;
};

export const GovDelegationActions = ({
  isWrongNetwork,
  blocked,
  delegationType,
  delegationToken,
  delegate,
}: GovDelegationActionsProps) => {
  const delegateByType = useRootStore((state) => state.delegateByType);
  const { currentAccount } = useWeb3Context();

  const { action, loadingTxns, mainTxState, requiresApproval } = useTransactionHandler({
    tryPermit: false,
    handleGetTxns: async () => {
      return delegateByType({
        user: currentAccount,
        delegatee: delegate,
        delegationType,
        governanceToken: (delegationToken as DelegationToken).address,
      });
    },
    skip: blocked || !delegationToken?.address,
    deps: [delegate, delegationType, delegationToken?.address],
  });

  // TODO: hash link not working
  return (
    <TxActionsWrapper
      requiresApproval={requiresApproval}
      blocked={blocked}
      preparingTransactions={loadingTxns}
      mainTxState={mainTxState}
      isWrongNetwork={isWrongNetwork}
      handleAction={action}
      actionText={<Trans>Delegate</Trans>}
      actionInProgressText={<Trans>Delegating</Trans>}
    />
  );
};
