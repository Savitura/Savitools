/**
 * @jest-environment node
 *
 * Soroban Storage Expiration API client (Issue #564):
 * Tests that estimateExpiration and estimateTtlExtension call the versioned API
 * endpoints through apiFetch with the correct URL, method, payload, credentials,
 * and support request abort signals.
 */
import {
  estimateExpiration,
  estimateSorobanExpiration,
  estimateSorobanTtlExtension,
  estimateTtlExtension,
} from '@/lib/api';

const originalFetch = global.fetch;

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    json: async () => body,
  } as unknown as Response;
}

describe('Soroban Storage Expiration API wrappers', () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('posts estimate expiration payload to /v1/soroban/estimate-expiration', async () => {
    const mockResult = {
      currentLedger: 1000,
      liveUntilLedger: 2000,
      ttlRemaining: 1000,
      storageType: 'persistent',
      isExpired: false,
      expiresIn: {
        ledgers: 1000,
        seconds: 5000,
        minutes: 83,
        hours: 1.4,
        days: 0.06,
      },
      estimatedExpirationDate: '2026-11-23T12:00:00.000Z',
      status: 'healthy',
      recommendation: 'Storage is healthy',
    };
    fetchMock.mockResolvedValue(jsonResponse(mockResult));

    const result = await estimateExpiration({
      currentLedger: 1000,
      liveUntilLedger: 2000,
      storageType: 'persistent',
    });

    expect(result).toEqual(mockResult);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:3001/api/v1/soroban/estimate-expiration');
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('include');
    expect(JSON.parse(String(init.body))).toEqual({
      currentLedger: 1000,
      liveUntilLedger: 2000,
      storageType: 'persistent',
    });
  });

  it('posts estimate TTL extension payload to /v1/soroban/estimate-ttl-extension', async () => {
    const mockResult = {
      currentTtl: 1000,
      extendByLedgers: 5000,
      newTtl: 6000,
      extendedLifetime: { ledgers: 5000, days: 0.29 },
      estimatedCost: { stroops: 50000, xlm: '0.005' },
      recommendation: 'Extension will add 0.3 days',
    };
    fetchMock.mockResolvedValue(jsonResponse(mockResult));

    const result = await estimateTtlExtension({
      currentTtl: 1000,
      extendByLedgers: 5000,
      entrySizeBytes: 1024,
      storageType: 'persistent',
    });

    expect(result).toEqual(mockResult);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:3001/api/v1/soroban/estimate-ttl-extension');
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('include');
    expect(JSON.parse(String(init.body))).toEqual({
      currentTtl: 1000,
      extendByLedgers: 5000,
      entrySizeBytes: 1024,
      storageType: 'persistent',
    });
  });

  it('supports alias functions estimateSorobanExpiration and estimateSorobanTtlExtension', () => {
    expect(estimateSorobanExpiration).toBe(estimateExpiration);
    expect(estimateSorobanTtlExtension).toBe(estimateTtlExtension);
  });

  it('respects AbortSignal when aborted', async () => {
    const controller = new AbortController();
    controller.abort();

    fetchMock.mockImplementation(() => {
      const err = new Error('The operation was aborted');
      err.name = 'AbortError';
      return Promise.reject(err);
    });

    await expect(
      estimateExpiration(
        { currentLedger: 100, liveUntilLedger: 200 },
        { signal: controller.signal },
      ),
    ).rejects.toThrow();
  });

  it('normalizes API errors cleanly', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      json: async () => ({ message: 'Ledger numbers must be non-negative' }),
    } as unknown as Response);

    await expect(estimateExpiration({ currentLedger: -1, liveUntilLedger: 100 })).rejects.toThrow(
      'Ledger numbers must be non-negative',
    );
  });
});
