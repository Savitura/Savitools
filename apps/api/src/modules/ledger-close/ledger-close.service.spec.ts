import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Between } from 'typeorm';
import { LedgerCloseStat } from './entities/ledger-close-stat.entity';
import { LedgerCloseService } from './ledger-close.service';

describe('LedgerCloseService.getStats', () => {
  const find = jest.fn();
  let service: LedgerCloseService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        LedgerCloseService,
        { provide: ConfigService, useValue: {} },
        { provide: getRepositoryToken(LedgerCloseStat), useValue: { find } },
      ],
    }).compile();
    service = moduleRef.get(LedgerCloseService);
  });

  beforeEach(() => find.mockReset());
  afterEach(() => jest.useRealTimers());

  it('defaults to the last 24 hours on mainnet and returns zeroes for empty history', async () => {
    const to = '2026-01-02T12:00:00.000Z';
    const from = '2026-01-01T12:00:00.000Z';
    jest.useFakeTimers().setSystemTime(new Date(to));
    find.mockResolvedValue([]);
    await expect(service.getStats({})).resolves.toEqual({
      network: 'mainnet',
      from,
      to,
      stats: [],
      summary: {
        avgCloseTimeSeconds: 0,
        avgLatencyMs: 0,
        p50LatencyMs: 0,
        p95LatencyMs: 0,
        p99LatencyMs: 0,
        totalLedgers: 0,
        totalTransactions: 0,
        totalOperations: 0,
      },
    });
    expect(find).toHaveBeenCalledWith({
      where: { network: 'mainnet', sampledAt: Between(new Date(from), new Date(to)) },
      order: { sampledAt: 'DESC' },
      take: 50_001,
    });
  });

  it('aggregates bounded testnet history and computes nearest-rank percentiles', async () => {
    const from = new Date('2026-01-01T00:00:00Z');
    const to = new Date('2026-04-01T00:00:00Z'); // Exactly 90 days.
    // Descending latency keeps the repository order distinct from percentile order.
    const rows = Array.from({ length: 20 }, (_, i) => ({
      ledgerSequence: 20 - i,
      closeTime: to,
      sampledAt: to,
      latencyMs: 20 - i,
      closeTimeSeconds: i === 0 ? 3 : 5,
      transactionCount: i === 0 ? null : 2,
      operationCount: i === 0 ? 5 : null,
    }));
    find.mockResolvedValue(rows);

    const result = await service.getStats({
      network: 'testnet',
      from: from.toISOString(),
      to: to.toISOString(),
    });
    expect(find).toHaveBeenCalledWith({
      where: { network: 'testnet', sampledAt: Between(from, to) },
      order: { sampledAt: 'DESC' },
      take: 50_001,
    });
    expect(result.summary).toEqual({
      totalLedgers: 20,
      totalTransactions: 38,
      totalOperations: 5,
      avgCloseTimeSeconds: 4.9,
      avgLatencyMs: 11,
      p50LatencyMs: 10,
      p95LatencyMs: 19,
      p99LatencyMs: 20,
    });
    expect(result.stats.map((stat) => stat.ledgerSequence)).toEqual(
      rows.map((row) => row.ledgerSequence),
    );
  });

  it.each([
    ['invalid', '2026-04-01', 'valid ISO dates'],
    ['2026-01-01', 'invalid', 'valid ISO dates'],
    ['2026-04-01', '2026-01-01', 'from must be before to'],
    ['2026-01-01', '2026-04-01T00:00:00.001Z', 'cannot exceed 90 days'],
  ])('rejects bounds %s to %s before querying', async (from, to, message) => {
    await expect(service.getStats({ from, to })).rejects.toThrow(message);
    expect(find).not.toHaveBeenCalled();
  });

  it('rejects a history with more than 50,000 samples', async () => {
    find.mockResolvedValue(new Array(50_001));
    await expect(service.getStats({})).rejects.toThrow('more than 50000 samples');
  });
});
