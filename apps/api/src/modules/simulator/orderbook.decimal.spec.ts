/**
 * Exact-decimal fixtures for OrderbookService order-book analytics.
 *
 * Every expectation is an explicit decimal string or integer worked out by
 * hand in stroops (1 stroop = 0.0000001), never an approximate float. The
 * rounding rules under test are the ones documented on `OrderbookResult`.
 */
jest.mock('redis', () => ({
  createClient: jest.fn(() => ({ connect: jest.fn(), quit: jest.fn(), on: jest.fn() })),
}));

import { BadRequestException } from '@nestjs/common';
import { OrderbookService, OrderbookResult } from './orderbook.service';

type Level = { price: string; amount: string };

const lvl = (price: string, amount: string): Level => ({ price, amount });

// i64 max in stroops: 9223372036854775807, well above Number.MAX_SAFE_INTEGER.
const I64_MAX_UNITS = '922337203685.4775807';

describe('OrderbookService decimal-safe analytics', () => {
  let service: OrderbookService;

  const compute = (bids: Level[], asks: Level[]): OrderbookResult =>
    (service as any).computeOrderbook('XLM', 'USDC:ISSUER', 'testnet', { bids, asks });

  beforeEach(() => {
    service = new OrderbookService({ get: jest.fn() } as any);
  });

  describe('normal book (typical XLM/USDC magnitudes)', () => {
    it('reports exact spread, mid price and bps', () => {
      const r = compute(
        [lvl('0.1000000', '100.0000000'), lvl('0.0990000', '200.0000000')],
        [lvl('0.1020000', '150.0000000'), lvl('0.1030000', '300.0000000')],
      );

      expect(r.bestBid).toBe('0.1000000');
      expect(r.bestAsk).toBe('0.1020000');
      expect(r.spread).toBe('0.0020000');
      expect(r.midPrice).toBe('0.1010000');
      // 0.0020000 / 0.1010000 * 10000 = 198.0198... -> 198.02
      expect(r.spreadBps).toBe(198.02);
    });
  });

  describe('amounts and prices above 2^53', () => {
    const r = () =>
      compute(
        [lvl('0.1000000', I64_MAX_UNITS), lvl('0.0500000', I64_MAX_UNITS)],
        [lvl('0.1000001', '0.0000001')],
      );

    it('keeps every digit of cumulative amounts', () => {
      const result = r();
      expect(result.bids[0].cumulativeAmount).toBe('922337203685.4775807');
      // 2 x 922337203685.4775807
      expect(result.bids[1].cumulativeAmount).toBe('1844674407370.9551614');
      expect(result.asks[0].cumulativeAmount).toBe('0.0000001');
    });

    it('passes Horizon price and amount strings through unchanged', () => {
      const result = r();
      expect(result.bids[0].price).toBe('0.1000000');
      expect(result.bids[0].amount).toBe('922337203685.4775807');
    });

    it('computes cumulative percent from exact totals', () => {
      const result = r();
      expect(result.bids.map((l) => l.cumulativePercent)).toEqual([50, 100]);
      expect(result.asks.map((l) => l.cumulativePercent)).toEqual([100]);
    });

    it('rounds the mid price half up at the seventh decimal', () => {
      // (0.1000000 + 0.1000001) / 2 = 0.10000005 -> 0.1000001
      expect(r().midPrice).toBe('0.1000001');
    });

    it('computes a one-stroop spread and its bps exactly', () => {
      const result = r();
      expect(result.spread).toBe('0.0000001');
      // 1 / 1000000.5 * 10000 = 0.00999999... -> 0.01 (uses the exact mid)
      expect(result.spreadBps).toBe(0.01);
    });

    it('scores liquidity from exact volumes', () => {
      // within 1% of mid: the 0.1 bid (I64_MAX) + the ask (1 stroop)
      // total: 2 x I64_MAX + 1 stroop  ->  (X + 1) / (2X + 1) = 50.000...% -> 50
      expect(r().liquidityScore).toBe(50);
    });
  });

  describe('seven-decimal amounts', () => {
    it('sums stroop-sized amounts without drift', () => {
      const r = compute(
        [
          lvl('0.1000000', '0.0000001'),
          lvl('0.1000000', '0.0000002'),
          lvl('0.1000000', '0.0000003'),
        ],
        [],
      );

      expect(r.bids.map((l) => l.cumulativeAmount)).toEqual([
        '0.0000001',
        '0.0000003',
        '0.0000006',
      ]);
      // 1/6, 3/6, 6/6 -> 16.67, 50, 100
      expect(r.bids.map((l) => l.cumulativePercent)).toEqual([16.67, 50, 100]);
    });

    it('rounds an exact percent tie half up (12.345 -> 12.35)', () => {
      const r = compute(
        [lvl('0.1000000', '12345.0000000'), lvl('0.1000000', '87655.0000000')],
        [],
      );
      expect(r.bids.map((l) => l.cumulativeAmount)).toEqual([
        '12345.0000000',
        '100000.0000000',
      ]);
      expect(r.bids.map((l) => l.cumulativePercent)).toEqual([12.35, 100]);
    });
  });

  describe('tiny prices', () => {
    it('handles one- and two-stroop prices exactly', () => {
      const r = compute(
        [lvl('0.0000001', '1.0000000')],
        [lvl('0.0000002', '1.0000000')],
      );

      expect(r.spread).toBe('0.0000001');
      // (1 + 2) / 2 = 1.5 stroops -> 2 (half up)
      expect(r.midPrice).toBe('0.0000002');
      // 1 / 1.5 * 10000 = 6666.666... -> 6666.67
      expect(r.spreadBps).toBe(6666.67);
      // both quotes sit far outside 1% of the mid
      expect(r.liquidityScore).toBe(0);
    });
  });

  describe('empty and zero-volume books', () => {
    it('returns zeros for an empty book', () => {
      const r = compute([], []);

      expect(r.bestBid).toBe('0');
      expect(r.bestAsk).toBe('0');
      expect(r.spread).toBe('0.0000000');
      expect(r.spreadBps).toBe(0);
      expect(r.midPrice).toBe('0.0000000');
      expect(r.liquidityScore).toBe(0);
      expect(r.bids).toEqual([]);
      expect(r.asks).toEqual([]);
    });

    it('handles levels with zero amount', () => {
      const r = compute(
        [lvl('0.1000000', '0.0000000')],
        [lvl('0.1020000', '0.0000000')],
      );

      expect(r.midPrice).toBe('0.1010000');
      expect(r.spread).toBe('0.0020000');
      expect(r.liquidityScore).toBe(0);
      expect(r.bids[0].cumulativeAmount).toBe('0.0000000');
      expect(r.bids[0].cumulativePercent).toBe(0);
      expect(r.asks[0].cumulativePercent).toBe(0);
    });
  });

  describe('one-sided books', () => {
    it('uses the bid as mid when there are no asks', () => {
      const r = compute([lvl('0.1000000', '5.0000000')], []);

      expect(r.bestAsk).toBe('0');
      expect(r.midPrice).toBe('0.1000000');
      expect(r.spread).toBe('0.0000000');
      expect(r.spreadBps).toBe(0);
      expect(r.liquidityScore).toBe(100);
      expect(r.asks).toEqual([]);
    });

    it('uses the ask as mid when there are no bids', () => {
      const r = compute([], [lvl('0.2500000', '4.0000000')]);

      expect(r.bestBid).toBe('0');
      expect(r.midPrice).toBe('0.2500000');
      expect(r.spread).toBe('0.0000000');
      expect(r.spreadBps).toBe(0);
      expect(r.liquidityScore).toBe(100);
      expect(r.asks[0].cumulativeAmount).toBe('4.0000000');
      expect(r.asks[0].cumulativePercent).toBe(100);
    });
  });

  describe('asymmetric sides', () => {
    it('scores a deep bid side against a thin ask side', () => {
      const r = compute(
        [lvl('0.1000000', '1000.0000000'), lvl('0.0900000', '3000.0000000')],
        [lvl('0.1010000', '10.0000000'), lvl('0.1200000', '990.0000000')],
      );

      expect(r.midPrice).toBe('0.1005000');
      expect(r.spread).toBe('0.0010000');
      // 0.0010000 / 0.1005000 * 10000 = 99.5024... -> 99.5
      expect(r.spreadBps).toBe(99.5);

      expect(r.bids.map((l) => l.cumulativeAmount)).toEqual(['1000.0000000', '4000.0000000']);
      expect(r.bids.map((l) => l.cumulativePercent)).toEqual([25, 100]);
      expect(r.asks.map((l) => l.cumulativeAmount)).toEqual(['10.0000000', '1000.0000000']);
      expect(r.asks.map((l) => l.cumulativePercent)).toEqual([1, 100]);

      // within 1% of mid (0.099495 .. 0.101505): 1000 bid + 10 ask = 1010 of 5000
      expect(r.liquidityScore).toBe(20);
    });
  });

  describe('liquidity score rules', () => {
    it('includes a level exactly at 99% of the mid, excludes one stroop below', () => {
      // one-sided, so mid = 0.1 and the bid threshold is exactly 0.0990000
      const r = compute(
        [
          lvl('0.1000000', '1.0000000'),
          lvl('0.0990000', '1.0000000'), // exactly 99%: included
          lvl('0.0989999', '1.0000000'), // just below: excluded
        ],
        [],
      );
      // 2 of 3 -> 66.67 -> 67
      expect(r.liquidityScore).toBe(67);
    });

    it('rounds an exact .5 score up (12.5 -> 13)', () => {
      const r = compute(
        [lvl('0.1000000', '1.0000000'), lvl('0.0500000', '7.0000000')],
        [],
      );
      expect(r.liquidityScore).toBe(13);
    });
  });

  describe('malformed Horizon values', () => {
    it.each([
      ['non-numeric price', [lvl('abc', '1.0000000')]],
      ['scientific notation', [lvl('1e-7', '1.0000000')]],
      ['more than 7 decimals', [lvl('0.10000001', '1.0000000')]],
      ['negative amount', [lvl('0.1000000', '-1.0000000')]],
    ])('rejects %s instead of silently coercing it', (_label, bids) => {
      expect(() => compute(bids, [])).toThrow(BadRequestException);
    });
  });
});
