import { NetworkConfig } from 'src/ui-config/networksConfig';
import { Warning } from 'src/components/primitives/Warning';
import { Link } from '../../../../components/primitives/Link';
import { Trans } from '@lingui/macro';
import { ChainId } from '@aave/contract-helpers';

type WalletEmptyInfoProps = Pick<NetworkConfig, 'bridge' | 'name'> & {
  chainId: number;
  icon?: boolean;
};

export function WalletEmptyInfo({ bridge, name, chainId, icon }: WalletEmptyInfoProps) {
  const assets = [ChainId.avalanche].includes(chainId) ? 'Ethereum & Bitcoin' : 'Ethereum';
  return (
    <Warning severity="info" icon={icon}>
      <Trans>Your {name} wallet is empty. Purchase or transfer assets</Trans>{' '}
      {bridge && (
        <Trans>
          or use {<Link href={bridge.url}>{bridge.name}</Link>} to transfer your {assets} assets.
        </Trans>
      )}
    </Warning>
  );
}
