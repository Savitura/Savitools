import {
  NetworkDetectionError,
  fetchNetworkPassphrase,
  verifyNetworkProfile,
} from '@/lib/network-detection';

function pendingFetch(onAbort?: (signal: AbortSignal) => void): typeof fetch {
  return jest.fn((_input: RequestInfo | URL, init?: RequestInit) => {
    return new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal as AbortSignal | undefined;
      const abort = () => {
        onAbort?.(signal as AbortSignal);
        const error = new Error('The operation was aborted');
        error.name = 'AbortError';
        reject(error);
      };
      if (signal?.aborted) {
        abort();
        return;
      }
      signal?.addEventListener('abort', abort);
    });
  }) as unknown as typeof fetch;
}

describe('network detection', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('detects the passphrase from a successful Horizon response', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ network_passphrase: 'Test SDF Network' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    ) as unknown as typeof fetch;

    await expect(
      fetchNetworkPassphrase('https://horizon-testnet.stellar.org/', { fetchImpl }),
    ).resolves.toBe('Test SDF Network');
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://horizon-testnet.stellar.org/',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('times out with a clear recoverable message', async () => {
    jest.useFakeTimers();
    const promise = fetchNetworkPassphrase('https://stalled.example.com', {
      fetchImpl: pendingFetch(),
      timeoutMs: 500,
    });
    const assertion = expect(promise).rejects.toMatchObject({
      code: 'TIMEOUT',
      retryable: true,
      message: expect.stringContaining('timed out after 500ms'),
    });

    jest.advanceTimersByTime(500);
    await assertion;
  });

  it('cancels an in-flight request when the caller aborts it', async () => {
    const controller = new AbortController();
    const promise = fetchNetworkPassphrase('https://slow.example.com', {
      fetchImpl: pendingFetch(),
      signal: controller.signal,
      timeoutMs: 10_000,
    });
    const assertion = expect(promise).rejects.toMatchObject({ code: 'CANCELLED' });

    controller.abort();
    await assertion;
  });

  it('returns a recoverable failure instead of hanging on an HTTP error', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValue(new Response('unavailable', { status: 503 })) as unknown as typeof fetch;

    await expect(
      verifyNetworkProfile(
        {
          horizonUrl: 'https://horizon.example.com',
          networkPassphrase: 'anything',
        },
        { fetchImpl },
      ),
    ).resolves.toMatchObject({
      valid: false,
      mismatch: true,
      error: expect.stringContaining('HTTP 503'),
    });
  });

  it('reports a mismatch when Horizon answers with another passphrase', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ network_passphrase: 'Public Global Stellar Network' }), {
        status: 200,
      }),
    ) as unknown as typeof fetch;

    await expect(
      verifyNetworkProfile(
        {
          horizonUrl: 'https://horizon.example.com',
          networkPassphrase: 'Test SDF Network',
        },
        { fetchImpl },
      ),
    ).resolves.toEqual({
      valid: true,
      actualPassphrase: 'Public Global Stellar Network',
      mismatch: true,
    });
  });

  it('surfaces cancellation rather than turning it into a validation failure', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      verifyNetworkProfile(
        { horizonUrl: 'https://slow.example.com', networkPassphrase: 'x' },
        { fetchImpl: pendingFetch(), signal: controller.signal },
      ),
    ).rejects.toBeInstanceOf(NetworkDetectionError);
  });
});
