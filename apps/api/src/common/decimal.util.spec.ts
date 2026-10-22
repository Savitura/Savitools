import {
  DecimalFormatError,
  FIXED_SCALE,
  divFixed,
  divRound,
  formatFixed,
  mulFixed,
  parseFixed,
} from './decimal.util';

describe('decimal.util', () => {
  describe('parseFixed', () => {
    it.each<[string, bigint]>([
      ['0', 0n],
      ['1', 10_000_000n],
      ['0.1', 1_000_000n],
      ['0.0000001', 1n], // smallest unit: one stroop
      ['0.10', 1_000_000n],
      // i64 max stroops: exactly representable here, not as a JS number
      ['922337203685.4775807', 9_223_372_036_854_775_807n],
      // whole part above Number.MAX_SAFE_INTEGER
      ['9007199254740993.0000001', 90_071_992_547_409_930_000_001n],
    ])('parses %s exactly', (input, stroops) => {
      expect(parseFixed(input)).toBe(stroops);
    });

    it.each(['', ' 1', '1 ', '-1', '+1', '1e-7', '1E3', '.5', '1.', '1.00000001', 'abc', '1,5'])(
      'rejects %j instead of coercing it',
      (input) => {
        expect(() => parseFixed(input)).toThrow(DecimalFormatError);
      },
    );

    it('rejects non-strings', () => {
      expect(() => parseFixed(undefined as never)).toThrow(DecimalFormatError);
      expect(() => parseFixed(null as never)).toThrow(DecimalFormatError);
    });

    it('names the offending value in the error', () => {
      expect(() => parseFixed('1e-7')).toThrow('Invalid decimal value: "1e-7"');
    });
  });

  describe('formatFixed', () => {
    it.each<[bigint, string]>([
      [0n, '0.0000000'],
      [1n, '0.0000001'],
      [-1n, '-0.0000001'],
      [10_000_000n, '1.0000000'],
      [9_223_372_036_854_775_807n, '922337203685.4775807'],
    ])('%s -> %s', (stroops, text) => {
      expect(formatFixed(stroops)).toBe(text);
    });

    it.each([
      '0.0000000',
      '0.0000001',
      '1.0000000',
      '922337203685.4775807',
      '1844674407370.9551614', // 2 * i64 max, beyond u64 stroops range of a double
      '9007199254740993.0000001',
    ])('round-trips %s through parseFixed', (text) => {
      expect(formatFixed(parseFixed(text))).toBe(text);
    });
  });

  describe('mulFixed / divFixed', () => {
    it('multiplies exactly, truncating at the seventh decimal', () => {
      // 3 * 0.3333333 = 0.9999999 (no float drift)
      expect(formatFixed(mulFixed(3n * FIXED_SCALE, 3_333_333n))).toBe('0.9999999');
      // 0.0000001 * 0.5 = 0.00000005 -> truncated to 0
      expect(mulFixed(1n, 5_000_000n)).toBe(0n);
    });

    it('divides exactly, truncating at the seventh decimal', () => {
      expect(divFixed(9_999_999n, 3n * FIXED_SCALE)).toBe(3_333_333n);
    });

    it('throws on division by zero', () => {
      expect(() => divFixed(1n, 0n)).toThrow(DecimalFormatError);
    });
  });

  describe('divRound', () => {
    it.each<[bigint, bigint, bigint]>([
      [1n, 3n, 0n], // 0.33 -> 0
      [2n, 3n, 1n], // 0.67 -> 1
      [1n, 2n, 1n], // tie 0.5 -> 1 (away from zero)
      [5n, 2n, 3n], // tie 2.5 -> 3
      [25n, 10n, 3n], // tie 2.5 -> 3
      [-1n, 2n, -1n], // tie -0.5 -> -1
      [-5n, 2n, -3n], // tie -2.5 -> -3
      [7n, -2n, -4n], // tie -3.5 -> -4
      [0n, 5n, 0n],
    ])('divRound(%s, %s) = %s', (n, d, expected) => {
      expect(divRound(n, d)).toBe(expected);
    });

    it('is exact for numerators beyond 2^53', () => {
      const big = 2n ** 80n;
      expect(divRound(big * 3n, 3n)).toBe(big);
      expect(divRound(big * 3n + 1n, 3n)).toBe(big); // remainder 1/3 rounds down
      expect(divRound(big * 3n + 2n, 3n)).toBe(big + 1n); // remainder 2/3 rounds up
    });

    it('throws on a zero denominator', () => {
      expect(() => divRound(1n, 0n)).toThrow(DecimalFormatError);
    });
  });
});
