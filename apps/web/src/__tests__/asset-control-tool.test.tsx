import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AssetControlTool } from '@/components/tools/asset-control-tool';
import { buildAccountFlagsXdr, getAssetControlFlags, getAssetTrustlines } from '@/lib/api';

jest.mock('@/lib/api', () => ({
  getAssetControlFlags: jest.fn(), getAssetTrustlines: jest.fn(), buildAccountFlagsXdr: jest.fn(),
  assetControlComposerLink: jest.fn(() => '/composer?operation=setOptions'),
}));

const getFlags = getAssetControlFlags as jest.MockedFunction<typeof getAssetControlFlags>;
const getTrustlines = getAssetTrustlines as jest.MockedFunction<typeof getAssetTrustlines>;
const buildFlags = buildAccountFlagsXdr as jest.MockedFunction<typeof buildAccountFlagsXdr>;
const issuer = 'G' + 'A'.repeat(55);
const flags = {
  asset: { code: 'USDC', issuer }, account: issuer,
  authorizationRequired: false, authorizationRevocable: true,
  authorizationClawbackEnabled: false, authorizationImmutable: false,
};

async function loadAsset() {
  await userEvent.type(screen.getByPlaceholderText('USDC'), 'usdc');
  await userEvent.type(screen.getByPlaceholderText('G… (56-character Stellar public key)'), issuer);
  await userEvent.click(screen.getByRole('button', { name: /load asset/i }));
}

describe('AssetControlTool', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getFlags.mockResolvedValue(flags);
    getTrustlines.mockResolvedValue({ asset: flags.asset, total: 0, fetched: 0, pages: 0, truncated: false, trustlines: [] });
  });

  it('loads flags and builds an unsigned SetOptions preview from toggled values', async () => {
    buildFlags.mockResolvedValue({
      xdr: 'AAAA', network: 'testnet', networkPassphrase: 'Test SDF Network ; September 2015',
      sourceAccount: issuer, sequence: '1', operationType: 'setOptions',
      operation: { setFlags: 1, clearFlags: 0 }, summary: 'Enable authorization required', unsigned: true,
    });
    render(<AssetControlTool />);
    await loadAsset();
    expect(await screen.findByRole('button', { name: /edit flags/i })).toBeEnabled();
    expect(getFlags).toHaveBeenCalledWith('USDC', issuer);
    await userEvent.click(screen.getByRole('button', { name: /edit flags/i }));
    await userEvent.click(screen.getByRole('checkbox', { name: /authorization required/i }));
    await userEvent.click(screen.getByRole('button', { name: /build setoptions xdr/i }));
    await waitFor(() => expect(buildFlags).toHaveBeenCalledWith('USDC', issuer, {
      authorizationRequired: true, authorizationRevocable: true,
      authorizationClawbackEnabled: false, authorizationImmutable: false,
    }));
    expect(await screen.findByText(/Enable authorization required/)).toBeInTheDocument();
  });

  it('shows load errors and prevents editing immutable flags', async () => {
    getFlags.mockRejectedValueOnce(Object.assign(new Error('Horizon unavailable'), { code: 'HORIZON_ERROR' }));
    render(<AssetControlTool />);
    await loadAsset();
    expect(await screen.findByText(/Horizon unavailable/)).toBeInTheDocument();
    getFlags.mockResolvedValueOnce({ ...flags, authorizationImmutable: true });
    await userEvent.click(screen.getByRole('button', { name: /load asset/i }));
    expect(await screen.findByRole('button', { name: /edit flags/i })).toBeDisabled();
    expect(buildFlags).not.toHaveBeenCalled();
  });

  it('shows a build error without opening an XDR preview', async () => {
    buildFlags.mockRejectedValue(new Error('No flags changed'));
    render(<AssetControlTool />);
    await loadAsset();
    await userEvent.click(await screen.findByRole('button', { name: /edit flags/i }));
    await userEvent.click(screen.getByRole('button', { name: /build setoptions xdr/i }));
    expect(await screen.findByText('No flags changed')).toBeInTheDocument();
  });
});
