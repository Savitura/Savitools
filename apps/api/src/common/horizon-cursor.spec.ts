import { Keypair } from '@stellar/stellar-sdk';
import { exploreHorizon, HorizonCursorLoopError, sanitizeHorizonEndpoint } from './horizon-cursor';

describe('exploreHorizon', () => {
  it('walks pages in order and forwards the cursor', async () => {
    const cursors: (string | null)[] = [];
    const result = await exploreHorizon(async (cursor) => {
      cursors.push(cursor);
      return cursor === null
        ? { records: ['a'], nextCursor: 'next' }
        : { records: ['b'], nextCursor: null };
    });
    expect(result).toEqual({
      records: ['a', 'b'],
      pages: 2,
      nextCursor: null,
      truncated: false,
    });
    expect(cursors).toEqual([null, 'next']);
  });

  it('stops at the page budget and reports a resumable cursor', async () => {
    const result = await exploreHorizon(
      async (cursor) => ({
        records: [cursor ?? 'first'],
        nextCursor: `${cursor ?? 'first'}-next`,
      }),
      { maxPages: 2 },
    );
    expect(result.pages).toBe(2);
    expect(result.truncated).toBe(true);
    expect(result.nextCursor).toBe('first-next-next');
  });

  it('rejects a repeated cursor instead of looping forever when no endpoint is supplied', async () => {
    let caught: unknown;
    try {
      await exploreHorizon(async (cursor) => ({
        records: [],
        nextCursor: cursor === null ? 'same' : 'same',
      }));
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(HorizonCursorLoopError);
    const loopError = caught as HorizonCursorLoopError;
    expect(loopError.code).toBe('HORIZON_CURSOR_LOOP');
    expect(loopError.message).toBe('Horizon pagination cursor repeated (page 2, cursor=same)');
    expect(loopError.diagnostics).toEqual({
      endpoint: null,
      page: 2,
      limit: 100,
      requestCursor: 'same',
      repeatedCursor: 'same',
      seenCursorCount: 1,
    });
  });

  it('includes sanitized endpoint and pagination state in loop diagnostics', async () => {
    let calls = 0;
    let caught: unknown;

    try {
      await exploreHorizon(
        async () => {
          calls += 1;
          return {
            records: [`row-${calls}`],
            nextCursor: calls === 1 ? 'c-101' : calls === 2 ? 'c-102' : 'c-101',
          };
        },
        {
          endpoint:
            'https://user:supersecret@horizon-testnet.stellar.org/accounts?asset=USDC:GISSUER&api_key=leak-me#frag',
          limit: 50,
        },
      );
    } catch (err) {
      caught = err;
    }

    expect(calls).toBe(3);
    expect(caught).toBeInstanceOf(HorizonCursorLoopError);
    const loopError = caught as HorizonCursorLoopError;
    expect(loopError.message).toBe(
      'Horizon pagination cursor repeated on https://horizon-testnet.stellar.org/accounts (page 3, cursor=c-101)',
    );
    expect(loopError.message).not.toContain('supersecret');
    expect(loopError.message).not.toContain('leak-me');
    expect(loopError.diagnostics).toEqual({
      endpoint: 'https://horizon-testnet.stellar.org/accounts',
      page: 3,
      limit: 50,
      requestCursor: 'c-102',
      repeatedCursor: 'c-101',
      seenCursorCount: 2,
    });
  });

  it('prefers per-page endpoint diagnostics over options.endpoint when present', async () => {
    await expect(
      exploreHorizon(
        async (cursor) => ({
          records: [],
          nextCursor: 'dup-token',
          endpoint:
            cursor === null
              ? 'https://horizon-testnet.stellar.org/trades?cursor=initial'
              : 'https://horizon-failover.stellar.org/trades?cursor=dup-token&token=secret',
        }),
        { endpoint: 'https://horizon-testnet.stellar.org/trades' },
      ),
    ).rejects.toMatchObject({
      message:
        'Horizon pagination cursor repeated on https://horizon-failover.stellar.org/trades (page 2, cursor=dup-token)',
      diagnostics: {
        endpoint: 'https://horizon-failover.stellar.org/trades',
        page: 2,
        requestCursor: 'dup-token',
        repeatedCursor: 'dup-token',
      },
    });
  });

  it('detects an immediate loop on page 1 when nextCursor repeats initialCursor', async () => {
    const fetchPage = jest.fn().mockResolvedValue({
      records: ['stale'],
      nextCursor: 'resume-token-42',
    });

    await expect(
      exploreHorizon(fetchPage, {
        initialCursor: 'resume-token-42',
        endpoint: 'GET /operations?cursor=resume-token-42&limit=25',
        limit: 25,
      }),
    ).rejects.toMatchObject({
      code: 'HORIZON_CURSOR_LOOP',
      message:
        'Horizon pagination cursor repeated on GET /operations (page 1, cursor=resume-token-42)',
      diagnostics: {
        endpoint: 'GET /operations',
        page: 1,
        limit: 25,
        requestCursor: 'resume-token-42',
        repeatedCursor: 'resume-token-42',
        seenCursorCount: 1,
      },
    });
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it('redacts secret seeds, strips control characters, and bounds oversized cursors', async () => {
    const leakedSeed = Keypair.random().secret();
    const noisyCursor = `${leakedSeed}\r\n${'x'.repeat(200)}`;

    let caught: unknown;
    try {
      await exploreHorizon(
        async () => ({
          records: [],
          nextCursor: noisyCursor,
        }),
        {
          initialCursor: noisyCursor,
          endpoint: `/accounts/${leakedSeed}/payments\r\nINJECTED?secret=1`,
        },
      );
    } catch (err) {
      caught = err;
    }

    const loopError = caught as HorizonCursorLoopError;
    expect(loopError.message).not.toContain(leakedSeed);
    expect(loopError.message).not.toContain('\n');
    expect(loopError.message).not.toContain('\r');
    expect(loopError.diagnostics.endpoint).toBe('/accounts/[REDACTED]/payments INJECTED');
    expect(loopError.diagnostics.repeatedCursor).toContain('[REDACTED]');
    expect(loopError.diagnostics.repeatedCursor.length).toBeLessThanOrEqual(129);
  });
});

describe('sanitizeHorizonEndpoint', () => {
  it('returns null for empty, whitespace, or query-only inputs', () => {
    expect(sanitizeHorizonEndpoint(undefined)).toBeNull();
    expect(sanitizeHorizonEndpoint('')).toBeNull();
    expect(sanitizeHorizonEndpoint('   \n\t  ')).toBeNull();
    expect(sanitizeHorizonEndpoint('?cursor=only')).toBeNull();
  });

  it('preserves HTTP method prefixes while stripping query strings and fragments', () => {
    expect(
      sanitizeHorizonEndpoint(
        'get https://horizon.stellar.org/ledgers/123/payments?limit=200#section',
      ),
    ).toBe('GET https://horizon.stellar.org/ledgers/123/payments');
  });
});
