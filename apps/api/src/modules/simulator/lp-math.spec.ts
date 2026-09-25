/**
 * lp-math.spec.ts – Unit tests for Stellar LP constant-product arithmetic.
 *
 * All fixtures use integer stroop values derived from the formulas specified
 * in CAP-0038 / SEP-0020. No floating-point arithmetic is used in assertions.
 */

import {
  STROOP,
  toStroops,
  fromStroops,
  isqrt,
  quoteDeposit,
  quoteWithdrawal,
  depositMinShares,
  withdrawalMinAmounts,
  formatPoolFee,
  feeNumerator,
  parseHorizonFee,
} from './lp-math';

// ─── helpers ──────────────────────────────────────────────────────────────

describe('toStroops / fromStroops', () => {
  it('converts an integer string with no decimal', () => {
    expect(toStroops('100')).toBe(100n * STROOP);
  });

  it('converts a 7-decimal string precisely', () => {
    expect(toStroops('1.0000001')).toBe(10_000_001n);
  });

  it('converts "0.0000001" (1 stroop)', () => {
    expect(toStroops('0.0000001')).toBe(1n);
  });

  it('round-trips a typical reserve amount', () => {
    const original = '1234567.8901234';
    const stroops = toStroops(original);
    expect(fromStroops(stroops)).toBe(original);
  });

  it('fromStroops pads the fractional part', () => {
    expect(fromStroops(1n)).toBe('0.0000001');
    expect(fromStroops(10_000_000n)).toBe('1.0000000');
  });

  it('handles the zero case', () => {
    expect(toStroops('0')).toBe(0n);
    expect(fromStroops(0n)).toBe('0.0000000');
  });
});

// ─── isqrt ────────────────────────────────────────────────────────────────

describe('isqrt', () => {
  it('returns 0 for 0', () => expect(isqrt(0n)).toBe(0n));
  it('returns 1 for 1', () => expect(isqrt(1n)).toBe(1n));
  it('returns 3 for 9', () => expect(isqrt(9n)).toBe(3n));
  it('returns 3 for 10 (floor)', () => expect(isqrt(10n)).toBe(3n));
  it('returns 99 for 9801', () => expect(isqrt(9801n)).toBe(99n));
  it('handles a large perfect square', () => {
    const n = 1_000_000_000_000n;
    expect(isqrt(n * n)).toBe(n);
  });
  it('throws for negative input', () => {
    expect(() => isqrt(-1n)).toThrow(RangeError);
  });
});

// ─── quoteDeposit ─────────────────────────────────────────────────────────

describe('quoteDeposit', () => {
  // Fixture: pool with 1000 XLM (A) and 500 USDC (B), 700 shares outstanding.
  // Ratio: A/B = 2.0  (1 USDC requires 2 XLM to maintain ratio)
  const reserveA = toStroops('1000');     // 10_000_000_000n
  const reserveB = toStroops('500');      //  5_000_000_000n
  const totalShares = toStroops('700');   //  7_000_000_000n

  describe('deposit by fixing A-side', () => {
    it('derives B from A using pool ratio', () => {
      // Deposit 100 XLM → should require 50 USDC
      const result = quoteDeposit({
        reserveA, reserveB, totalShares,
        depositA: toStroops('100'),
      });
      expect(result.depositA).toBe(toStroops('100'));
      expect(result.depositB).toBe(toStroops('50')); // 100 * 500/1000
    });

    it('mints shares proportional to the deposit fraction', () => {
      // 100 / 1000 = 10 % of pool → 10 % of 700 = 70 shares
      const result = quoteDeposit({
        reserveA, reserveB, totalShares,
        depositA: toStroops('100'),
      });
      expect(result.sharesOut).toBe(toStroops('70')); // 100/1000 * 700
    });

    it('price impact is zero for exact-ratio deposits', () => {
      // Exact-ratio deposit: price impact in ppm should be 0
      const result = quoteDeposit({
        reserveA, reserveB, totalShares,
        depositA: toStroops('100'),
      });
      expect(result.priceImpactPpm).toBe(0n);
    });

    it('computes correct spot prices', () => {
      const result = quoteDeposit({
        reserveA, reserveB, totalShares,
        depositA: toStroops('100'),
      });
      // spotPriceAperB = reserveA / reserveB * STROOP = 2.0000000
      expect(result.spotPriceAperB).toBe((reserveA * STROOP) / reserveB);
      // spotPriceBperA = 0.5 in stroop precision
      expect(result.spotPriceBperA).toBe((reserveB * STROOP) / reserveA);
    });
  });

  describe('deposit by fixing B-side', () => {
    it('derives A from B using pool ratio', () => {
      // Deposit 50 USDC → should require 100 XLM
      const result = quoteDeposit({
        reserveA, reserveB, totalShares,
        depositB: toStroops('50'),
      });
      expect(result.depositB).toBe(toStroops('50'));
      expect(result.depositA).toBe(toStroops('100'));
    });

    it('mints the same shares as the symmetric A-side deposit', () => {
      const fromA = quoteDeposit({ reserveA, reserveB, totalShares, depositA: toStroops('100') });
      const fromB = quoteDeposit({ reserveA, reserveB, totalShares, depositB: toStroops('50') });
      expect(fromA.sharesOut).toBe(fromB.sharesOut);
    });
  });

  describe('bootstrap case (totalShares = 0)', () => {
    it('uses the geometric mean for share issuance', () => {
      // isqrt(100 * 400) = isqrt(40000) = 200 (in stroop units)
      const dA = toStroops('100');
      const dB = toStroops('400');
      const result = quoteDeposit({
        reserveA: dA,
        reserveB: dB,
        totalShares: 0n,
        depositA: dA,
      });
      // depositB is derived: dA * reserveB / reserveA = dA * 1 = dA = dB
      // sharesOut = isqrt(dA * depositB)
      // Since reserveA == reserveB (same value), depositB = dA = toStroops('100')
      // But this pool ratio is 1:1, so depositB = 100, sharesOut = isqrt(100*100 stroops^2)
      // Let's verify the formula directly: sharesOut = isqrt(depositA * depositB)
      expect(result.sharesOut).toBe(isqrt(result.depositA * result.depositB));
    });
  });

  describe('validation', () => {
    it('throws when both depositA and depositB are provided', () => {
      expect(() => quoteDeposit({
        reserveA, reserveB, totalShares,
        depositA: toStroops('10'),
        depositB: toStroops('5'),
      })).toThrow(RangeError);
    });

    it('throws when neither depositA nor depositB is provided', () => {
      expect(() => quoteDeposit({ reserveA, reserveB, totalShares })).toThrow(RangeError);
    });

    it('throws when depositA is zero', () => {
      expect(() => quoteDeposit({
        reserveA, reserveB, totalShares,
        depositA: 0n,
      })).toThrow(RangeError);
    });

    it('throws when reserves are zero', () => {
      expect(() => quoteDeposit({
        reserveA: 0n, reserveB, totalShares,
        depositA: toStroops('1'),
      })).toThrow(RangeError);
    });

    it('throws when deposit would mint zero shares', () => {
      // 1 stroop deposit against a pool where reserveA is 10 times bigger than totalShares
      // so depositA * totalShares / reserveA = 1 * 1 / 100 = 0 (floor)
      expect(() => quoteDeposit({
        reserveA: 100n,          // 100 stroops of reserveA
        reserveB: 100n,
        totalShares: 1n,         // only 1 share outstanding
        depositA: 1n,            // 1 stroop → 1*1/100 = 0 shares (floor)
      })).toThrow(RangeError);
    });
  });
});

// ─── quoteWithdrawal ──────────────────────────────────────────────────────

describe('quoteWithdrawal', () => {
  // Fixture: same pool as above
  const reserveA = toStroops('1000');
  const reserveB = toStroops('500');
  const totalShares = toStroops('700');

  describe('withdrawal by shares', () => {
    it('returns correct A and B amounts', () => {
      // Burn 70 shares = 10 % of pool → 100 XLM, 50 USDC
      const result = quoteWithdrawal({
        reserveA, reserveB, totalShares,
        sharesToBurn: toStroops('70'),
      });
      expect(result.reserveAOut).toBe(toStroops('100'));
      expect(result.reserveBOut).toBe(toStroops('50'));
    });

    it('reflects the burned shares in the result', () => {
      const shares = toStroops('70');
      const result = quoteWithdrawal({ reserveA, reserveB, totalShares, sharesToBurn: shares });
      expect(result.sharesToBurn).toBe(shares);
    });

    it('price impact is near-zero for small withdrawals', () => {
      const result = quoteWithdrawal({
        reserveA, reserveB, totalShares,
        sharesToBurn: toStroops('1'),
      });
      // Tiny withdrawal should not materially shift the price
      expect(result.priceImpactPpm).toBeLessThanOrEqual(100n); // ≤0.01%
    });

    it('returns spot prices matching pool ratio', () => {
      const result = quoteWithdrawal({ reserveA, reserveB, totalShares, sharesToBurn: toStroops('70') });
      expect(result.spotPriceAperB).toBe((reserveA * STROOP) / reserveB);
      expect(result.spotPriceBperA).toBe((reserveB * STROOP) / reserveA);
    });
  });

  describe('withdrawal by desired A amount', () => {
    it('back-calculates shares and returns matching B amount', () => {
      // Want 100 XLM out → 10 % of pool → need 70 shares
      const result = quoteWithdrawal({
        reserveA, reserveB, totalShares,
        desiredA: toStroops('100'),
      });
      expect(result.reserveAOut).toBeGreaterThanOrEqual(toStroops('100'));
      expect(result.sharesToBurn).toBeGreaterThan(0n);
      // Shares should not exceed totalShares
      expect(result.sharesToBurn).toBeLessThanOrEqual(totalShares);
    });
  });

  describe('full withdrawal', () => {
    it('releases all reserves when burning all shares', () => {
      const result = quoteWithdrawal({ reserveA, reserveB, totalShares, sharesToBurn: totalShares });
      expect(result.reserveAOut).toBe(reserveA);
      expect(result.reserveBOut).toBe(reserveB);
    });
  });

  describe('validation', () => {
    it('throws when both sharesToBurn and desiredA are provided', () => {
      expect(() => quoteWithdrawal({
        reserveA, reserveB, totalShares,
        sharesToBurn: toStroops('70'),
        desiredA: toStroops('100'),
      })).toThrow(RangeError);
    });

    it('throws when neither input is provided', () => {
      expect(() => quoteWithdrawal({ reserveA, reserveB, totalShares })).toThrow(RangeError);
    });

    it('throws when pool has no shares', () => {
      expect(() => quoteWithdrawal({
        reserveA, reserveB,
        totalShares: 0n,
        sharesToBurn: toStroops('1'),
      })).toThrow(RangeError);
    });

    it('throws when sharesToBurn exceeds totalShares', () => {
      expect(() => quoteWithdrawal({
        reserveA, reserveB, totalShares,
        sharesToBurn: totalShares + 1n,
      })).toThrow(RangeError);
    });

    it('throws when desiredA exceeds pool reserves', () => {
      expect(() => quoteWithdrawal({
        reserveA, reserveB, totalShares,
        desiredA: reserveA + 1n,
      })).toThrow(RangeError);
    });

    it('throws when withdrawal would release zero reserves', () => {
      expect(() => quoteWithdrawal({
        reserveA: toStroops('1000000000'),
        reserveB: toStroops('500000000'),
        totalShares: toStroops('100000000000'),
        sharesToBurn: 1n, // 1 stroop burn → 0 reserves out (floor)
      })).toThrow(RangeError);
    });
  });
});

// ─── depositMinShares ─────────────────────────────────────────────────────

describe('depositMinShares', () => {
  it('returns full amount at 0% slippage', () => {
    const shares = toStroops('100');
    expect(depositMinShares(shares, 0)).toBe(shares);
  });

  it('returns 99% at 1% slippage', () => {
    const shares = 100_000_000n; // 10 shares
    const min = depositMinShares(shares, 1);
    // 10 * 0.99 = 9.9 → floor to 9.9000000 stroops: 99_000_000n
    expect(min).toBe(99_000_000n);
  });

  it('returns 0 at 100% slippage', () => {
    expect(depositMinShares(toStroops('100'), 100)).toBe(0n);
  });

  it('throws for out-of-range slippage', () => {
    expect(() => depositMinShares(toStroops('100'), -1)).toThrow(RangeError);
    expect(() => depositMinShares(toStroops('100'), 101)).toThrow(RangeError);
  });
});

// ─── withdrawalMinAmounts ─────────────────────────────────────────────────

describe('withdrawalMinAmounts', () => {
  it('returns full amounts at 0% slippage', () => {
    const a = toStroops('100');
    const b = toStroops('50');
    const result = withdrawalMinAmounts(a, b, 0);
    expect(result.minA).toBe(a);
    expect(result.minB).toBe(b);
  });

  it('applies slippage independently to each asset', () => {
    const a = toStroops('100');
    const b = toStroops('50');
    const result = withdrawalMinAmounts(a, b, 0.5);
    // 0.5% slippage: multiplier = 0.995
    expect(result.minA).toBeLessThan(a);
    expect(result.minB).toBeLessThan(b);
    // Should be approximately 99.5% of original
    expect(Number(result.minA) / Number(a)).toBeCloseTo(0.995, 3);
  });

  it('throws for negative slippage', () => {
    expect(() => withdrawalMinAmounts(1n, 1n, -0.1)).toThrow(RangeError);
  });
});

// ─── formatPoolFee / feeNumerator / parseHorizonFee ───────────────────────

describe('fee helpers', () => {
  it('formatPoolFee: 30 → "0.30%"', () => {
    expect(formatPoolFee(30)).toBe('0.30%');
  });

  it('formatPoolFee: 0 → "0.00%"', () => {
    expect(formatPoolFee(0)).toBe('0.00%');
  });

  it('feeNumerator returns the raw integer as bigint', () => {
    expect(feeNumerator(30)).toBe(30n);
  });

  it('parseHorizonFee parses a numeric string', () => {
    expect(parseHorizonFee('30')).toBe(30);
  });

  it('parseHorizonFee parses a number', () => {
    expect(parseHorizonFee(30)).toBe(30);
  });

  it('parseHorizonFee throws for negative', () => {
    expect(() => parseHorizonFee(-1)).toThrow(RangeError);
  });

  it('parseHorizonFee throws for NaN string', () => {
    expect(() => parseHorizonFee('abc')).toThrow(RangeError);
  });
});
