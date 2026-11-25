import { fireEvent, render, screen } from '@testing-library/react';
import {
  safeJsonParse,
  safeGetItem,
  safeSetItem,
  BROWSER_STORAGE_KEYS,
} from '@/lib/browser-storage';
import {
  readProgress,
  writeProgress,
  isDismissed,
  dismissOnboarding,
  ONBOARDING_STORAGE_KEY,
  ONBOARDING_DISMISSED_KEY,
} from '@/lib/onboarding';
import { ContractsTool } from '@/components/tools/contracts-tool';
import { ComposerTool } from '@/components/tools/composer';
import { FederationTool } from '@/components/tools/federation-tool';

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    prefetch: jest.fn(),
  }),
  useSearchParams: () => ({
    get: jest.fn(),
  }),
  usePathname: () => '/',
}));

jest.mock('@/lib/network-context', () => ({
  useNetwork: () => ({ network: 'testnet' }),
}));

jest.mock('@/components/command-palette', () => ({
  useCommandPalette: () => ({
    registerContextActions: jest.fn(() => jest.fn()),
  }),
  ShortcutBadge: () => null,
}));

jest.mock('@hello-pangea/dnd', () => ({
  DragDropContext: ({ children }: any) => <div>{children}</div>,
  Droppable: ({ children }: any) => children({ draggableProps: {}, innerRef: null }, {}),
  Draggable: ({ children }: any) =>
    children(
      {
        draggableProps: { style: {} },
        dragHandleProps: {},
        innerRef: null,
      },
      { isDragging: false },
    ),
}));

jest.mock('@/lib/composer-api', () => ({
  fetchOperations: jest.fn().mockResolvedValue([]),
  buildTransaction: jest.fn(),
  simulateTransaction: jest.fn(),
}));

jest.mock('@/lib/api', () => ({
  attachContractAbi: jest.fn(),
  deployContract: jest.fn(),
  encodeContractAbiArguments: jest.fn(),
  getContractAbi: jest.fn(),
  invokeContract: jest.fn(),
  getContractInfo: jest.fn(),
  getContractEvents: jest.fn(),
  replayContractEvents: jest.fn(),
  resolveFederation: jest.fn(),
  generateTransferLink: jest.fn(),
  createFederationRecord: jest.fn(),
  updateFederationRecord: jest.fn(),
  deleteFederationRecord: jest.fn(),
  parseFederationToml: jest.fn(),
  apiErrorMessage: jest.fn((_, fallback) => fallback),
}));

describe('Safe JSON Parsing and Corrupted Storage Resilience (Issue #568)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.localStorage.clear();
  });

  describe('browser-storage: safeJsonParse and storage helpers', () => {
    it('returns parsed value for valid JSON', () => {
      expect(safeJsonParse('{"a": 1, "b": "test"}', null)).toEqual({ a: 1, b: 'test' });
      expect(safeJsonParse('[1, 2, 3]', [])).toEqual([1, 2, 3]);
      expect(safeJsonParse('"hello"', '')).toBe('hello');
      expect(safeJsonParse('42', 0)).toBe(42);
      expect(safeJsonParse('true', false)).toBe(true);
    });

    it('returns fallback without throwing for malformed or corrupted JSON', () => {
      const fallback = { safe: true };
      expect(safeJsonParse('{invalid json', fallback)).toBe(fallback);
      expect(safeJsonParse('{"unclosed: 12', fallback)).toBe(fallback);
      expect(safeJsonParse('[1, 2, ', fallback)).toBe(fallback);
      expect(safeJsonParse('undefined', fallback)).toBe(fallback);
    });

    it('returns fallback for empty, null, or non-string inputs', () => {
      expect(safeJsonParse('', 'default')).toBe('default');
      expect(safeJsonParse('   ', 'default')).toBe('default');
      expect(safeJsonParse(null, 'default')).toBe('default');
      expect(safeJsonParse(undefined, 'default')).toBe('default');
      expect(safeJsonParse(123 as unknown as string, 'default')).toBe('default');
    });

    it('safeGetItem gracefully falls back when key is missing or corrupted', () => {
      expect(safeGetItem('missing_key', { fallback: 1 })).toEqual({ fallback: 1 });

      window.localStorage.setItem('corrupted_key', '{not: valid, json}');
      expect(safeGetItem('corrupted_key', [])).toEqual([]);

      window.localStorage.setItem('valid_key', JSON.stringify({ ok: true }));
      expect(safeGetItem('valid_key', { ok: false })).toEqual({ ok: true });
    });

    it('safeSetItem safely writes to storage', () => {
      const res = safeSetItem('test_key', { hello: 'world' });
      expect(res.success).toBe(true);
      expect(window.localStorage.getItem('test_key')).toBe(JSON.stringify({ hello: 'world' }));
    });
  });

  describe('onboarding: storage resilience', () => {
    it('readProgress returns defaults when storage is missing', () => {
      const progress = readProgress();
      expect(progress).toEqual({
        inspect: false,
        sandbox: false,
        simulate: false,
        fluxa: false,
      });
    });

    it('readProgress returns defaults when storage contains corrupted JSON', () => {
      window.localStorage.setItem(ONBOARDING_STORAGE_KEY, '{bad-json');
      const progress = readProgress();
      expect(progress.inspect).toBe(false);
      expect(progress.sandbox).toBe(false);
    });

    it('readProgress returns defaults when storage contains non-object JSON', () => {
      window.localStorage.setItem(ONBOARDING_STORAGE_KEY, '12345');
      expect(readProgress().inspect).toBe(false);

      window.localStorage.setItem(ONBOARDING_STORAGE_KEY, '"some string"');
      expect(readProgress().sandbox).toBe(false);

      window.localStorage.setItem(ONBOARDING_STORAGE_KEY, '[1, 2, 3]');
      expect(readProgress().simulate).toBe(false);
    });

    it('readProgress merges partial valid progress safely', () => {
      window.localStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify({ inspect: true }));
      const progress = readProgress();
      expect(progress.inspect).toBe(true);
      expect(progress.sandbox).toBe(false);
    });

    it('writeProgress writes valid progress to storage', () => {
      writeProgress({ inspect: true, sandbox: true, simulate: false, fluxa: false });
      const raw = window.localStorage.getItem(ONBOARDING_STORAGE_KEY);
      expect(JSON.parse(raw ?? '{}')).toEqual({
        inspect: true,
        sandbox: true,
        simulate: false,
        fluxa: false,
      });
    });

    it('isDismissed and dismissOnboarding handle both raw string and JSON values', () => {
      expect(isDismissed()).toBe(false);

      dismissOnboarding();
      expect(isDismissed()).toBe(true);

      // Raw unquoted string in storage
      window.localStorage.setItem(ONBOARDING_DISMISSED_KEY, 'true');
      expect(isDismissed()).toBe(true);

      // Corrupted storage
      window.localStorage.setItem(ONBOARDING_DISMISSED_KEY, 'random_nonsense');
      expect(isDismissed()).toBe(false);
    });
  });

  describe('contracts-tool: storage and user input error handling', () => {
    it('loads safely when contracts history in localStorage is corrupted or malformed', () => {
      window.localStorage.setItem(BROWSER_STORAGE_KEYS.CONTRACTS_HISTORY, '{broken json');
      render(<ContractsTool />);
      expect(screen.getByRole('heading', { name: /Deploy Contract/i })).toBeInTheDocument();
      expect(screen.getByText(/No contracts deployed yet/i)).toBeInTheDocument();
    });

    it('filters out non-contract items from history', () => {
      window.localStorage.setItem(
        BROWSER_STORAGE_KEYS.CONTRACTS_HISTORY,
        JSON.stringify([
          { notAContract: true },
          {
            contractId: 'CC123',
            wasmHash: 'hash123',
            name: 'ValidContract',
            deployedAt: Date.now(),
          },
        ]),
      );
      render(<ContractsTool />);
      expect(screen.getByText('CC123')).toBeInTheDocument();
      expect(screen.queryByText('notAContract')).not.toBeInTheDocument();
    });

    it('shows inline validation error on AbiDiffPanel when input is invalid JSON', () => {
      render(<ContractsTool />);

      const prevTextarea = screen.getByLabelText(/Previous ABI/i);
      const newTextarea = screen.getByLabelText(/New ABI/i);
      const compareButton = screen.getByRole('button', { name: /Compare ABIs/i });

      // Initially compareButton is disabled because textareas are empty
      expect(compareButton).toBeDisabled();

      // Enter invalid JSON in Previous ABI and valid in New ABI
      fireEvent.change(prevTextarea, { target: { value: 'not-valid-json' } });
      fireEvent.change(newTextarea, { target: { value: '{"methods": []}' } });
      expect(compareButton).not.toBeDisabled();
      fireEvent.click(compareButton);
      expect(screen.getByText(/Previous ABI document must be valid JSON/i)).toBeInTheDocument();

      // Typing in Previous ABI clears the error
      fireEvent.change(prevTextarea, { target: { value: '{"methods": []}' } });
      expect(
        screen.queryByText(/Previous ABI document must be valid JSON/i),
      ).not.toBeInTheDocument();

      // Enter invalid JSON in New ABI
      fireEvent.change(newTextarea, { target: { value: '{broken' } });
      fireEvent.click(compareButton);
      expect(screen.getByText(/New ABI document must be valid JSON/i)).toBeInTheDocument();

      // Typing in New ABI clears the error
      fireEvent.change(newTextarea, { target: { value: '{"methods": []}' } });
      expect(screen.queryByText(/New ABI document must be valid JSON/i)).not.toBeInTheDocument();
    });

    it('validates constructor arguments and clears error on valid array input', () => {
      render(<ContractsTool />);

      const argsInput = screen.getByPlaceholderText(/\["GAIH3YPF3Y6\.\.\.", 1234567890\]/);

      // Invalid JSON syntax
      fireEvent.change(argsInput, { target: { value: '{"malformed":' } });
      expect(screen.getByText(/Invalid JSON in args, expected array/i)).toBeInTheDocument();

      // Valid JSON but not an array
      fireEvent.change(argsInput, { target: { value: '{"not": "array"}' } });
      expect(screen.getByText(/Args must be a JSON array/i)).toBeInTheDocument();

      // Corrected to valid JSON array clears error
      fireEvent.change(argsInput, { target: { value: '["arg1", 123]' } });
      expect(screen.queryByText(/Invalid JSON/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/Args must be a JSON array/i)).not.toBeInTheDocument();
    });
  });

  describe('composer: storage resilience', () => {
    it('loads safely when composer-workspaces in localStorage is corrupted', () => {
      window.localStorage.setItem(
        BROWSER_STORAGE_KEYS.LEGACY_COMPOSER_WORKSPACES,
        '{"unclosed-json',
      );
      render(<ComposerTool />);
      expect(screen.getByRole('button', { name: /Workspaces/i })).toBeInTheDocument();
    });

    it('filters out invalid workspace objects from storage', () => {
      window.localStorage.setItem(
        BROWSER_STORAGE_KEYS.LEGACY_COMPOSER_WORKSPACES,
        JSON.stringify([
          { invalid: 'shape' },
          { id: 'ws-1', name: 'Valid Workspace', composerState: { operations: [] } },
        ]),
      );
      render(<ComposerTool />);
      fireEvent.click(screen.getByRole('button', { name: /Workspaces/i }));
      expect(screen.getByText('Valid Workspace')).toBeInTheDocument();
    });
  });

  describe('federation-tool: storage resilience', () => {
    it('loads safely when counterparties storage is corrupted or malformed', () => {
      window.localStorage.setItem(
        BROWSER_STORAGE_KEYS.FEDERATION_COUNTERPARTIES,
        '{corrupted-data',
      );
      render(<FederationTool />);
      expect(
        screen.getByRole('heading', { name: /Asset metadata and home-domain check/i }),
      ).toBeInTheDocument();
    });

    it('filters out invalid counterparties from storage', () => {
      window.localStorage.setItem(
        BROWSER_STORAGE_KEYS.FEDERATION_COUNTERPARTIES,
        JSON.stringify([
          'not-an-object',
          { bad: 'props' },
          { input: 'user*domain.com', name: 'Saved User' },
        ]),
      );
      render(<FederationTool />);
      expect(screen.getByText('Saved User')).toBeInTheDocument();
    });
  });
});
