import { BadRequestException } from '@nestjs/common';
import { fetchFromHorizon } from './horizon.util';

const lookupMock = jest.fn();
jest.mock('dns/promises', () => ({
  lookup: (...args: unknown[]) => lookupMock(...args),
}));

const HORIZON_URL = 'https://horizon-testnet.stellar.org/order_book';

describe('fetchFromHorizon', () => {
  beforeEach(() => {
    lookupMock.mockReset().mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns the parsed payload for a successful JSON response', async () => {
    const payload = { bids: [], asks: [] };
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: jest.fn().mockResolvedValue(payload),
    });

    await expect(fetchFromHorizon(HORIZON_URL)).resolves.toEqual(payload);
  });

  it('keeps the upstream status when an error body is plain text', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 503,
      statusText: 'Service Unavailable',
      headers: new Headers(),
      text: jest.fn().mockResolvedValue('upstream maintenance'),
    });

    await expect(fetchFromHorizon(HORIZON_URL)).rejects.toThrow(
      'Horizon error (503): upstream maintenance',
    );
  });

  it('uses a JSON error detail without losing the upstream status', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 429,
      statusText: 'Too Many Requests',
      headers: new Headers(),
      text: jest.fn().mockResolvedValue(JSON.stringify({ detail: 'rate limit reached' })),
    });

    const error = (await fetchFromHorizon(HORIZON_URL).catch(
      (caught) => caught,
    )) as BadRequestException & { upstreamStatus: number };

    expect(error).toBeInstanceOf(BadRequestException);
    expect(error.message).toContain('429');
    expect(error.message).toContain('rate limit reached');
    expect(error.upstreamStatus).toBe(429);
  });

  it('falls back to status text when the error body cannot be read', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 504,
      statusText: 'Gateway Timeout',
      headers: new Headers(),
      text: jest.fn().mockRejectedValue(new Error('body stream failed')),
    });

    await expect(fetchFromHorizon(HORIZON_URL)).rejects.toThrow(
      'Horizon error (504): Gateway Timeout',
    );
  });

  it('reports the status for a non-JSON successful response', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: jest.fn().mockRejectedValue(new SyntaxError('Unexpected token <')),
    });

    await expect(fetchFromHorizon(HORIZON_URL)).rejects.toThrow(
      'Horizon returned a non-JSON response (HTTP 200)',
    );
  });
});
