import { apiFetch } from '@/lib/api';
import * as composer from '@/lib/composer-api';

jest.mock('@/lib/api', () => ({
  apiFetch: jest.fn(),
}));

const apiFetchMock = apiFetch as unknown as jest.Mock;
const fetchMock = jest.fn();
const sentinel = { marker: 'api-response' };

const buildInput: composer.BuildTransactionInput = {
  sourceAccount: 'GSOURCE',
  operations: [{ type: 'payment' }],
};
const simulateInput: composer.SimulateTransactionInput = { xdr: 'XDR' };
const sequenceInput: composer.RunTransactionSequenceInput = {
  stopOnFailure: true,
  steps: [],
};
const workspaceInput: composer.CreateComposerWorkspaceInput = {
  name: 'workspace',
  data: { source: 'GSOURCE' },
};

const wrapperCases = [
  {
    name: 'fetchOperations',
    invoke: () => composer.fetchOperations(),
    path: '/composer/operations',
    init: undefined,
  },
  {
    name: 'buildTransaction',
    invoke: () => composer.buildTransaction(buildInput),
    path: '/composer/build',
    init: { method: 'POST', body: JSON.stringify(buildInput) },
  },
  {
    name: 'buildFeeBump',
    invoke: () => composer.buildFeeBump({ innerXdr: 'INNER', feeSource: 'GFEE', baseFee: '200' }),
    path: '/composer/fee-bump',
    init: {
      method: 'POST',
      body: JSON.stringify({ innerXdr: 'INNER', feeSource: 'GFEE', baseFee: '200' }),
    },
  },
  {
    name: 'inspectFeeBump',
    invoke: () => composer.inspectFeeBump('ABC'),
    path: '/composer/fee-bump/inspect',
    init: { method: 'POST', body: '{"innerXdr":"ABC"}' },
  },
  {
    name: 'simulateTransaction',
    invoke: () => composer.simulateTransaction(simulateInput),
    path: '/composer/simulate',
    init: { method: 'POST', body: JSON.stringify(simulateInput) },
  },
  {
    name: 'runTransactionSequence',
    invoke: () => composer.runTransactionSequence(sequenceInput),
    path: '/composer/sequence/run',
    init: { method: 'POST', body: JSON.stringify(sequenceInput) },
  },
  {
    name: 'listComposerWorkspaces',
    invoke: () => composer.listComposerWorkspaces(),
    path: '/workspaces?tool=composer',
    init: undefined,
  },
  {
    name: 'createComposerWorkspace',
    invoke: () => composer.createComposerWorkspace(workspaceInput),
    path: '/workspaces/composer',
    init: { method: 'POST', body: JSON.stringify(workspaceInput) },
  },
  {
    name: 'fetchTransactionSequenceRuns',
    invoke: () => composer.fetchTransactionSequenceRuns(),
    path: '/composer/sequence',
    init: undefined,
  },
  {
    name: 'getComposerWorkspace',
    invoke: () => composer.getComposerWorkspace('ws-1'),
    path: '/workspaces/composer/ws-1',
    init: undefined,
  },
  {
    name: 'updateComposerWorkspace',
    invoke: () => composer.updateComposerWorkspace('ws-1', { a: 1 }),
    path: '/workspaces/composer/ws-1',
    init: { method: 'PUT', body: '{"data":{"a":1}}' },
  },
  {
    name: 'renameComposerWorkspace',
    invoke: () => composer.renameComposerWorkspace('ws-1', 'new'),
    path: '/workspaces/composer/ws-1',
    init: { method: 'PATCH', body: '{"name":"new"}' },
  },
  {
    name: 'deleteComposerWorkspace',
    invoke: () => composer.deleteComposerWorkspace('ws-1'),
    path: '/workspaces/composer/ws-1',
    init: { method: 'DELETE' },
  },
  {
    name: 'duplicateComposerWorkspace',
    invoke: () => composer.duplicateComposerWorkspace('ws-1'),
    path: '/workspaces/composer/ws-1/duplicate',
    init: { method: 'POST' },
  },
  {
    name: 'exportComposerWorkspace',
    invoke: () => composer.exportComposerWorkspace('ws-1'),
    path: '/workspaces/composer/ws-1/export',
    init: undefined,
  },
  {
    name: 'importComposerWorkspace',
    invoke: () => composer.importComposerWorkspace(workspaceInput),
    path: '/workspaces/composer/import',
    init: { method: 'POST', body: JSON.stringify(workspaceInput) },
  },
  {
    name: 'shareComposerWorkspace',
    invoke: () => composer.shareComposerWorkspace('ws-1'),
    path: '/workspaces/composer/ws-1/share',
    init: { method: 'POST' },
  },
  {
    name: 'unshareComposerWorkspace',
    invoke: () => composer.unshareComposerWorkspace('ws-1'),
    path: '/workspaces/composer/ws-1/unshare',
    init: { method: 'POST' },
  },
  {
    name: 'fetchSharedComposerWorkspace',
    invoke: () => composer.fetchSharedComposerWorkspace('token-1'),
    path: '/shared/composer/token-1',
    init: undefined,
  },
];

function jsonResponse(data: unknown, ok = true): Response {
  return {
    ok,
    json: jest.fn().mockResolvedValue(data),
  } as unknown as Response;
}

beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = fetchMock as unknown as typeof fetch;
});

describe('composer API wrappers', () => {
  it.each(wrapperCases)(
    '$name forwards the exact request and returns the apiFetch response',
    async ({ invoke, path, init }) => {
      apiFetchMock.mockResolvedValue(sentinel);

      await expect(invoke()).resolves.toBe(sentinel);
      expect(apiFetchMock).toHaveBeenCalledTimes(1);
      expect(apiFetchMock.mock.calls[0]).toEqual(init === undefined ? [path] : [path, init]);
    },
  );

  it('propagates apiFetch failures unchanged', async () => {
    const apiError = new Error('request failed');
    apiFetchMock.mockRejectedValue(apiError);

    await expect(composer.fetchOperations()).rejects.toBe(apiError);
  });

  it('interpolates workspace identifiers without encoding them', async () => {
    apiFetchMock.mockResolvedValue(sentinel);

    await composer.getComposerWorkspace('ws/1 name');

    expect(apiFetchMock).toHaveBeenCalledWith('/workspaces/composer/ws/1 name');
  });
});

describe('Horizon submission', () => {
  it.each([
    { network: 'testnet' as const, url: 'https://horizon-testnet.stellar.org' },
    { network: 'mainnet' as const, url: 'https://horizon.stellar.org' },
  ])('selects the built-in $network Horizon URL', async ({ network, url }) => {
    fetchMock.mockResolvedValue(jsonResponse({ hash: 'abc' }));

    await expect(composer.submitToHorizon('XDR', network)).resolves.toEqual({
      success: true,
      hash: 'abc',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      `${url}/transactions`,
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('prefers an explicit Horizon URL, trims trailing slashes and forwards the signal', async () => {
    const controller = new AbortController();
    fetchMock.mockResolvedValue(jsonResponse({ hash: 'abc' }));

    await composer.submitToHorizon(
      'SIGNED+XDR',
      'mainnet',
      'https://custom.example///',
      controller.signal,
    );

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://custom.example/transactions');
    expect(init.headers).toEqual({ 'Content-Type': 'application/x-www-form-urlencoded' });
    expect(init.body).toBe(new URLSearchParams({ tx: 'SIGNED+XDR' }).toString());
    expect(init.signal).toBe(controller.signal);
  });

  it.each([
    { body: { detail: 'detail wins', title: 'title' }, ok: false, expected: 'detail wins' },
    { body: { title: 'Transaction Failed' }, ok: false, expected: 'Transaction Failed' },
    { body: { detail: '', title: 'fallback' }, ok: false, expected: '' },
    { body: {}, ok: true, expected: 'Submission failed' },
    { body: { hash: '' }, ok: true, expected: 'Submission failed' },
  ])('returns $expected for $body', async ({ body, ok, expected }) => {
    fetchMock.mockResolvedValue(jsonResponse(body, ok));

    await expect(
      composer.submitSignedTransaction('XDR', 'https://horizon.example'),
    ).resolves.toEqual({
      success: false,
      error: expected,
    });
  });

  it('returns fetch rejections as error strings', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));

    await expect(
      composer.submitSignedTransaction('XDR', 'https://horizon.example'),
    ).resolves.toEqual({ success: false, error: 'Error: offline' });
  });

  it('returns JSON parse failures as error strings', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: jest.fn().mockRejectedValue(new SyntaxError('bad json')),
    } as unknown as Response);

    const result = await composer.submitSignedTransaction('XDR', 'https://horizon.example');

    expect(result.success).toBe(false);
    expect(result.error).toContain('SyntaxError: bad json');
  });
});
