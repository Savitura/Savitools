import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import SorobanExpirationPage from '@/app/soroban-expiration/page';
import { estimateExpiration, estimateTtlExtension } from '@/lib/api';

jest.mock('@/lib/api', () => ({
  ...jest.requireActual('@/lib/api'),
  estimateExpiration: jest.fn(),
  estimateTtlExtension: jest.fn(),
}));

const estimateExpirationMock = estimateExpiration as jest.MockedFunction<typeof estimateExpiration>;
const estimateTtlExtensionMock = estimateTtlExtension as jest.MockedFunction<
  typeof estimateTtlExtension
>;

describe('SorobanExpirationPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Expiration tab', () => {
    it('shows inline validation errors when submitting empty inputs', async () => {
      render(<SorobanExpirationPage />);

      const button = screen.getByRole('button', { name: /estimate expiration/i });
      await userEvent.click(button);

      expect(await screen.findByText('Current ledger is required')).toBeInTheDocument();
      expect(screen.getByText('Live until ledger is required')).toBeInTheDocument();
      expect(estimateExpirationMock).not.toHaveBeenCalled();
    });

    it('shows inline validation error for non-integer or negative inputs', async () => {
      render(<SorobanExpirationPage />);

      const currentInput = screen.getByLabelText(/current ledger/i);
      const liveUntilInput = screen.getByLabelText(/live until ledger/i);
      const button = screen.getByRole('button', { name: /estimate expiration/i });

      // Negative number for current ledger
      await userEvent.type(currentInput, '-10');
      await userEvent.type(liveUntilInput, '1500');
      await userEvent.click(button);

      expect(await screen.findByText('Current ledger must be non-negative')).toBeInTheDocument();
      expect(estimateExpirationMock).not.toHaveBeenCalled();

      // Clear and type valid current, but non-integer in live until
      await userEvent.clear(currentInput);
      await userEvent.type(currentInput, '1000');
      await userEvent.clear(liveUntilInput);
      await userEvent.type(liveUntilInput, '1500.5');
      await userEvent.click(button);

      expect(
        await screen.findByText('Live until ledger must be a valid integer'),
      ).toBeInTheDocument();
      expect(estimateExpirationMock).not.toHaveBeenCalled();
    });

    it('submits parsed integers to estimateExpiration and renders result', async () => {
      estimateExpirationMock.mockResolvedValue({
        currentLedger: 1000000,
        liveUntilLedger: 1500000,
        ttlRemaining: 500000,
        storageType: 'persistent',
        isExpired: false,
        expiresIn: {
          ledgers: 500000,
          seconds: 2500000,
          minutes: 41666,
          hours: 694.4,
          days: 28.93,
        },
        estimatedExpirationDate: '2026-12-22T00:00:00.000Z',
        status: 'warning',
        recommendation: 'Consider extending TTL soon',
      });

      render(<SorobanExpirationPage />);

      const currentInput = screen.getByLabelText(/current ledger/i);
      const liveUntilInput = screen.getByLabelText(/live until ledger/i);
      const button = screen.getByRole('button', { name: /estimate expiration/i });

      await userEvent.type(currentInput, '1000000');
      await userEvent.type(liveUntilInput, '1500000');
      await userEvent.click(button);

      await waitFor(() => expect(estimateExpirationMock).toHaveBeenCalledTimes(1));

      expect(estimateExpirationMock).toHaveBeenCalledWith(
        {
          currentLedger: 1000000,
          liveUntilLedger: 1500000,
          storageType: 'persistent',
        },
        expect.objectContaining({
          signal: expect.any(AbortSignal),
        }),
      );

      expect(await screen.findByText(/warning status/i)).toBeInTheDocument();
      expect(screen.getByText('500,000')).toBeInTheDocument();
      expect(screen.getByText('Consider extending TTL soon')).toBeInTheDocument();
    });
  });

  describe('TTL Extension tab', () => {
    it('shows inline validation errors for invalid inputs in extension tab', async () => {
      render(<SorobanExpirationPage />);

      // Switch to TTL Extension tab
      const extensionTab = screen.getByRole('tab', { name: /ttl extension cost/i });
      await userEvent.click(extensionTab);

      const button = screen.getByRole('button', { name: /estimate extension cost/i });
      await userEvent.click(button);

      expect(await screen.findByText('Current TTL is required')).toBeInTheDocument();
      expect(screen.getByText('Extend by ledgers is required')).toBeInTheDocument();
      expect(estimateTtlExtensionMock).not.toHaveBeenCalled();

      // Test extendByLedgers <= 0
      const currentTtlInput = screen.getByLabelText(/current ttl/i);
      const extendByInput = screen.getByLabelText(/extend by \(ledgers\)/i);
      await userEvent.type(currentTtlInput, '10000');
      await userEvent.type(extendByInput, '0');
      await userEvent.click(button);

      expect(
        await screen.findByText('Extend by ledgers must be greater than 0'),
      ).toBeInTheDocument();
      expect(estimateTtlExtensionMock).not.toHaveBeenCalled();
    });

    it('submits parsed integers to estimateTtlExtension and renders result', async () => {
      estimateTtlExtensionMock.mockResolvedValue({
        currentTtl: 100000,
        extendByLedgers: 518400,
        newTtl: 618400,
        extendedLifetime: {
          ledgers: 518400,
          days: 30,
        },
        estimatedCost: {
          stroops: 518400,
          xlm: '0.05184',
        },
        recommendation: 'Extending by 30 days will cost 0.05184 XLM',
      });

      render(<SorobanExpirationPage />);

      const extensionTab = screen.getByRole('tab', { name: /ttl extension cost/i });
      await userEvent.click(extensionTab);

      const currentTtlInput = screen.getByLabelText(/current ttl/i);
      const extendByInput = screen.getByLabelText(/extend by \(ledgers\)/i);
      const button = screen.getByRole('button', { name: /estimate extension cost/i });

      await userEvent.type(currentTtlInput, '100000');
      await userEvent.type(extendByInput, '518400');
      await userEvent.click(button);

      await waitFor(() => expect(estimateTtlExtensionMock).toHaveBeenCalledTimes(1));

      expect(estimateTtlExtensionMock).toHaveBeenCalledWith(
        {
          currentTtl: 100000,
          extendByLedgers: 518400,
          entrySizeBytes: 1024,
          storageType: 'persistent',
        },
        expect.objectContaining({
          signal: expect.any(AbortSignal),
        }),
      );

      expect(await screen.findByText('Extension Estimate')).toBeInTheDocument();
      expect(screen.getByText('618,400')).toBeInTheDocument();
      expect(screen.getByText('0.05184')).toBeInTheDocument();
      expect(screen.getByText('Extending by 30 days will cost 0.05184 XLM')).toBeInTheDocument();
    });
  });

  describe('Abort on unmount', () => {
    it('aborts in-flight estimateExpiration request when unmounting', async () => {
      let capturedSignal: AbortSignal | undefined;
      estimateExpirationMock.mockImplementation((_, options) => {
        capturedSignal = options?.signal;
        return new Promise(() => {}); // never resolves
      });

      const { unmount } = render(<SorobanExpirationPage />);

      const currentInput = screen.getByLabelText(/current ledger/i);
      const liveUntilInput = screen.getByLabelText(/live until ledger/i);
      const button = screen.getByRole('button', { name: /estimate expiration/i });

      await userEvent.type(currentInput, '1000000');
      await userEvent.type(liveUntilInput, '1500000');
      await userEvent.click(button);

      expect(estimateExpirationMock).toHaveBeenCalledTimes(1);
      expect(capturedSignal).toBeDefined();
      expect(capturedSignal?.aborted).toBe(false);

      unmount();

      expect(capturedSignal?.aborted).toBe(true);
    });

    it('aborts in-flight estimateTtlExtension request when unmounting', async () => {
      let capturedSignal: AbortSignal | undefined;
      estimateTtlExtensionMock.mockImplementation((_, options) => {
        capturedSignal = options?.signal;
        return new Promise(() => {});
      });

      const { unmount } = render(<SorobanExpirationPage />);

      const extensionTab = screen.getByRole('tab', { name: /ttl extension cost/i });
      await userEvent.click(extensionTab);

      const currentTtlInput = screen.getByLabelText(/current ttl/i);
      const extendByInput = screen.getByLabelText(/extend by \(ledgers\)/i);
      const button = screen.getByRole('button', { name: /estimate extension cost/i });

      await userEvent.type(currentTtlInput, '100000');
      await userEvent.type(extendByInput, '518400');
      await userEvent.click(button);

      expect(estimateTtlExtensionMock).toHaveBeenCalledTimes(1);
      expect(capturedSignal).toBeDefined();
      expect(capturedSignal?.aborted).toBe(false);

      unmount();

      expect(capturedSignal?.aborted).toBe(true);
    });
  });
});
