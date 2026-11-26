import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SandboxTool } from '@/components/tools/sandbox-tool';
import { sandboxFund } from '@/lib/api';

jest.mock('@/lib/network-context', () => ({ useNetwork: () => ({ network: 'testnet' }) }));
jest.mock('@/components/command-palette', () => ({
  useCommandPalette: () => ({ registerContextActions: jest.fn(() => jest.fn()) }),
  ShortcutBadge: () => null,
}));
jest.mock('@/lib/recent-items', () => ({ addRecentItem: jest.fn() }));
jest.mock('@/lib/api', () => ({
  sandboxFund: jest.fn(), sandboxGetAccount: jest.fn(), sandboxSendPayment: jest.fn(), sandboxResetAccount: jest.fn(),
}));

const fund = sandboxFund as jest.MockedFunction<typeof sandboxFund>;

async function generate() {
  await userEvent.click(screen.getByRole('button', { name: /generate keypair/i }));
  return (await screen.findByText(/^G[A-Z2-7]{55}$/)).textContent!;
}

describe('SandboxTool funding', () => {
  beforeEach(() => jest.clearAllMocks());

  it('funds the generated account on testnet and displays the confirmed balance', async () => {
    fund.mockImplementation(async (publicKey) => ({
      publicKey, funded: true, txHash: 'txhash', confirmationStatus: 'confirmed', startingBalance: '10000.0000000',
    }));
    render(<SandboxTool />);
    const publicKey = await generate();
    await userEvent.click(screen.getByRole('button', { name: /fund via friendbot/i }));
    await waitFor(() => expect(fund).toHaveBeenCalledWith(publicKey, 'testnet'));
    expect((await screen.findByText('Funded successfully!')).closest('p'))
      .toHaveTextContent('10000.0000000 XLM');
    expect(screen.getByRole('link', { name: /view transaction/i })).toBeInTheDocument();
  });

  it('shows the funding error and allows a retry', async () => {
    fund.mockRejectedValueOnce(new Error('Friendbot unavailable')).mockResolvedValueOnce({
      publicKey: 'account', funded: true, txHash: null, confirmationStatus: 'confirmed', startingBalance: '10000',
    });
    render(<SandboxTool />);
    await generate();
    await userEvent.click(screen.getByRole('button', { name: /fund via friendbot/i }));
    expect(await screen.findByText(/Friendbot unavailable/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /fund via friendbot/i }));
    await waitFor(() => expect(fund).toHaveBeenCalledTimes(2));
    expect(await screen.findByText(/Funded successfully!/i)).toBeInTheDocument();
  });
});
