/**
 * Federation counterparty storage — malformed-entry rejection
 *
 * Covers the two defensive layers added to prevent malformed entries from
 * entering the address book:
 *
 *  1. loadSavedCounterparties: drops pre-existing entries whose `input` field
 *     does not match a known Stellar address type (public key, federation
 *     address, or domain).
 *
 *  2. saveCounterparty (the "Save counterparty" button): silently ignores a
 *     save attempt when the current input does not resolve to a known type.
 *
 * Note: the "Save counterparty" button only renders after a successful lookup
 * (`!loading && !error && hasResults`). The negative-path tests exploit the
 * fact that changing the input field after a lookup does not clear prior
 * results, so the save button stays visible while the input holds garbage.
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { FederationTool } from '@/components/tools/federation-tool';
import { BROWSER_STORAGE_KEYS } from '@/lib/browser-storage';
import { resolveFederation } from '@/lib/api';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

jest.mock('@/lib/api', () => ({
  resolveFederation: jest.fn(),
  fetchStellarToml: jest.fn(),
  fetchSepSupport: jest.fn(),
  fetchFederationDiagnostics: jest.fn(),
  previewTransferLink: jest.fn(),
  validateHomeDomain: jest.fn(),
  fetchAssetMetadata: jest.fn(),
}));

const resolveMock = resolveFederation as jest.MockedFunction<typeof resolveFederation>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STORAGE_KEY = BROWSER_STORAGE_KEYS.FEDERATION_COUNTERPARTIES;

/** A minimal valid FederationResolveResult that makes `hasResults` truthy. */
const FED_RESULT = {
  stellarAddress: 'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN7',
  federationAddress: 'alice*stellar.org',
  memo: null,
  memoType: null,
  homeDomain: null,
};

function seedStorage(entries: unknown[]) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

function readStorage(): unknown[] {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  return JSON.parse(raw) as unknown[];
}

function renderTool() {
  render(<FederationTool />);
}

/**
 * Types a value into the main lookup input, submits the form, and waits for
 * the "Save counterparty" button to appear (which only renders after a
 * successful lookup).
 */
async function lookupAndWaitForSaveButton(value: string) {
  fireEvent.change(screen.getByPlaceholderText(/federation address/i), {
    target: { value },
  });
  fireEvent.click(screen.getByRole('button', { name: /inspect/i }));
  await screen.findByRole('button', { name: /save counterparty/i });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('federation counterparty storage — malformed-entry rejection', () => {
  beforeEach(() => {
    window.localStorage.clear();
    resolveMock.mockResolvedValue(FED_RESULT);
  });

  afterEach(() => {
    resolveMock.mockReset();
  });

  // -------------------------------------------------------------------------
  // loadSavedCounterparties: entries stored in the past
  // -------------------------------------------------------------------------

  describe('loadSavedCounterparties', () => {
    it('displays well-formed entries that were already in storage', () => {
      seedStorage([
        { input: 'alice*stellar.org', name: 'Alice' },
        { input: 'GDJ47UQJNT6UOMV3CLNZ43XGDKOUM3UHV7V3FF3W4KMIRRNICNSS2N2H', name: 'Issuer' },
        { input: 'stellar.org', name: 'Stellar' },
      ]);

      renderTool();

      expect(screen.getByText('Alice')).toBeInTheDocument();
      expect(screen.getByText('Issuer')).toBeInTheDocument();
      expect(screen.getByText('Stellar')).toBeInTheDocument();
    });

    it('silently drops entries whose input is a free-form string that is not a valid address type', () => {
      seedStorage([
        { input: 'alice*stellar.org', name: 'Valid' },
        { input: 'this is not an address', name: 'Garbage' },
        { input: '!!!INVALID!!!', name: 'Symbols' },
        { input: '', name: 'Empty string' },
      ]);

      renderTool();

      expect(screen.getByText('Valid')).toBeInTheDocument();
      expect(screen.queryByText('Garbage')).not.toBeInTheDocument();
      expect(screen.queryByText('Symbols')).not.toBeInTheDocument();
      expect(screen.queryByText('Empty string')).not.toBeInTheDocument();
    });

    it('drops entries that are missing the input or name fields entirely', () => {
      seedStorage([
        { name: 'No input field' },
        { input: 'alice*stellar.org' },
        { input: 'alice*stellar.org', name: 'Valid' },
        null,
        42,
      ]);

      renderTool();

      // Only the fully-shaped and format-valid entry survives
      expect(screen.getByText('Valid')).toBeInTheDocument();
      expect(screen.queryByText('No input field')).not.toBeInTheDocument();
    });

    it('renders an empty address book when storage holds only malformed entries', () => {
      seedStorage([
        { input: 'javascript:alert(1)', name: 'XSS attempt' },
        { input: 'http://evil.com', name: 'URL' },
        { input: '   ', name: 'Whitespace only' },
      ]);

      renderTool();

      // The "Address book" section must not appear — no valid entries survive
      expect(screen.queryByText('XSS attempt')).not.toBeInTheDocument();
      expect(screen.queryByText('URL')).not.toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // saveCounterparty: the "Save counterparty" button
  // -------------------------------------------------------------------------

  describe('saveCounterparty', () => {
    it('saves a valid federation address (user*domain)', async () => {
      renderTool();
      await lookupAndWaitForSaveButton('bob*example.com');

      fireEvent.click(screen.getByRole('button', { name: /save counterparty/i }));

      await waitFor(() => {
        const stored = readStorage() as Array<{ input: string }>;
        expect(stored.some((e) => e.input === 'bob*example.com')).toBe(true);
      });
    });

    it('saves a valid Stellar public key', async () => {
      renderTool();
      await lookupAndWaitForSaveButton(
        'GDJ47UQJNT6UOMV3CLNZ43XGDKOUM3UHV7V3FF3W4KMIRRNICNSS2N2H',
      );

      fireEvent.click(screen.getByRole('button', { name: /save counterparty/i }));

      await waitFor(() => {
        const stored = readStorage() as Array<{ input: string }>;
        expect(
          stored.some((e) => e.input === 'GDJ47UQJNT6UOMV3CLNZ43XGDKOUM3UHV7V3FF3W4KMIRRNICNSS2N2H'),
        ).toBe(true);
      });
    });

    it('saves a valid domain', async () => {
      renderTool();
      await lookupAndWaitForSaveButton('anchor.example.com');

      fireEvent.click(screen.getByRole('button', { name: /save counterparty/i }));

      await waitFor(() => {
        const stored = readStorage() as Array<{ input: string }>;
        expect(stored.some((e) => e.input === 'anchor.example.com')).toBe(true);
      });
    });

    it('does not save a free-form string that is not a recognisable address type', async () => {
      renderTool();
      // Start with a valid lookup so the save button appears
      await lookupAndWaitForSaveButton('alice*stellar.org');

      // Now corrupt the input — prior results are not cleared, so the save
      // button remains visible
      fireEvent.change(screen.getByPlaceholderText(/federation address/i), {
        target: { value: 'not an address at all' },
      });
      fireEvent.click(screen.getByRole('button', { name: /save counterparty/i }));

      await waitFor(() => {
        const stored = readStorage() as Array<{ input: string }>;
        expect(stored.some((e) => e.input === 'not an address at all')).toBe(false);
      });
    });

    it('does not save a URL-shaped string', async () => {
      renderTool();
      await lookupAndWaitForSaveButton('alice*stellar.org');

      fireEvent.change(screen.getByPlaceholderText(/federation address/i), {
        target: { value: 'http://evil.example.com/payload' },
      });
      fireEvent.click(screen.getByRole('button', { name: /save counterparty/i }));

      await waitFor(() => {
        const stored = readStorage() as Array<{ input: string }>;
        expect(stored.some((e) => e.input.startsWith('http'))).toBe(false);
      });
    });

    it('preserves previously saved valid entries when a malformed save is rejected', async () => {
      // Seed one valid entry so we can confirm it survives the rejected save
      seedStorage([{ input: 'alice*stellar.org', name: 'Alice' }]);

      renderTool();
      await lookupAndWaitForSaveButton('bob*example.com');

      // Save the valid lookup target first
      fireEvent.click(screen.getByRole('button', { name: /save counterparty/i }));
      await waitFor(() => {
        const stored = readStorage() as Array<{ input: string }>;
        expect(stored.some((e) => e.input === 'bob*example.com')).toBe(true);
      });

      // Now attempt a malformed save
      fireEvent.change(screen.getByPlaceholderText(/federation address/i), {
        target: { value: '!!!garbage!!!' },
      });
      fireEvent.click(screen.getByRole('button', { name: /save counterparty/i }));

      await waitFor(() => {
        const stored = readStorage() as Array<{ input: string }>;
        // The malformed entry was NOT added
        expect(stored.some((e) => e.input === '!!!garbage!!!')).toBe(false);
        // The previously saved valid entries are still there
        expect(stored.some((e) => e.input === 'bob*example.com')).toBe(true);
        expect(stored.some((e) => e.input === 'alice*stellar.org')).toBe(true);
      });
    });
  });
});
