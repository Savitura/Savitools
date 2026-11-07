/**
 * Composer sign & submit dialog: secret-key mode signs with the active
 * profile's passphrase (Savitura/Savitools#423) and is never offered on
 * mainnet (Savitura/Savitools#422).
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Keypair, Networks } from '@stellar/stellar-sdk';

import { SignSubmitDialog } from '@/components/tools/composer/sign-submit-dialog';
import { isWalletAvailable, signTransactionXdr } from '@/lib/stellar-signer';
import { submitSignedTransaction } from '@/lib/composer-api';

jest.mock('@/lib/stellar-signer', () => ({
  ...jest.requireActual('@/lib/stellar-signer'),
  isWalletAvailable: jest.fn(),
  signTransactionXdr: jest.fn(),
  signWithWallet: jest.fn(),
  requestWalletAccess: jest.fn(),
}));

jest.mock('@/lib/composer-api', () => ({
  submitSignedTransaction: jest.fn(),
}));

const mockIsWalletAvailable = isWalletAvailable as jest.MockedFunction<typeof isWalletAvailable>;
const mockSign = signTransactionXdr as jest.MockedFunction<typeof signTransactionXdr>;
const mockSubmit = submitSignedTransaction as jest.MockedFunction<typeof submitSignedTransaction>;

const FUTURENET_PASSPHRASE = 'Test SDF Future Network ; October 2022';

function renderDialog(props: Partial<React.ComponentProps<typeof SignSubmitDialog>> = {}) {
  return render(
    <SignSubmitDialog
      xdr="UNSIGNED_XDR"
      network="testnet"
      horizonUrl="https://horizon-testnet.stellar.org"
      networkPassphrase={Networks.TESTNET}
      onClose={jest.fn()}
      onSuccess={jest.fn()}
      onError={jest.fn()}
      {...props}
    />,
  );
}

describe('SignSubmitDialog', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsWalletAvailable.mockReturnValue(false);
    mockSign.mockResolvedValue('SIGNED_XDR');
    mockSubmit.mockResolvedValue({ success: true, hash: 'tx-hash' } as never);
  });

  it('signs in secret-key mode with a custom profile passphrase', async () => {
    const user = userEvent.setup();
    const secret = Keypair.random().secret();
    renderDialog({
      network: 'futurenet',
      horizonUrl: 'https://horizon-futurenet.stellar.org',
      networkPassphrase: FUTURENET_PASSPHRASE,
    });

    await user.type(screen.getByLabelText(/secret key/i), secret);
    await user.click(screen.getByRole('button', { name: /sign & submit/i }));

    await waitFor(() => expect(mockSubmit).toHaveBeenCalled());
    expect(mockSign).toHaveBeenCalledWith('UNSIGNED_XDR', secret, FUTURENET_PASSPHRASE);
    expect(mockSubmit).toHaveBeenCalledWith('SIGNED_XDR', 'https://horizon-futurenet.stellar.org');
  });

  it.each([
    ['the mainnet network', { network: 'mainnet', networkPassphrase: Networks.PUBLIC }],
    ['a custom profile with the public passphrase', { network: 'custom', networkPassphrase: Networks.PUBLIC }],
  ])('disables secret-key mode on %s with a clear warning', async (_label, props) => {
    renderDialog(props);

    expect(await screen.findByTestId('mainnet-secret-key-warning')).toHaveTextContent(
      /do not paste a mainnet secret key/i,
    );
    expect(screen.getByRole('button', { name: /secret key/i })).toBeDisabled();
    expect(screen.queryByLabelText(/secret key/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign & submit/i })).toBeDisabled();
    expect(mockSign).not.toHaveBeenCalled();
  });
});
