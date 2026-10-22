/**
 * Decimal-safe arithmetic for Stellar amounts and prices.
 *
 * Horizon reports amounts and prices as decimal STRINGS with up to seven
 * fractional digits (one stroop = 1e-7). Converting them to a JavaScript
 * `number` is lossy: values above Number.MAX_SAFE_INTEGER stroops (~9.0e8 units)
 * lose their low digits, and sums of seven-decimal values pick up binary
 * rounding error.
 *
 * Everything here works on `bigint` values scaled by FIXED_SCALE (1e7), so
 * parsing, addition, comparison and formatting are exact. Rounding only happens
 * where a helper says so, and each rounding rule is stated on the helper.
 *
 * Nothing in this file imports Nest or any framework: errors are plain
 * `DecimalFormatError`s and the caller decides how to surface them.
 */

/** Number of fractional digits Stellar amounts and prices carry. */
export const FIXED_DECIMALS = 7;

/** 10^7: the number of stroops in one unit. */
export const FIXED_SCALE = 10_000_000n;

/** Raised when a value is not a valid non-negative decimal string. */
export class DecimalFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DecimalFormatError';
    // Keep `instanceof` working when compiled to older targets.
    Object.setPrototypeOf(this, DecimalFormatError.prototype);
  }
}

/**
 * Parses a non-negative decimal string with at most seven fractional digits
 * into stroops. Exact: "922337203685.4775807" -> 9223372036854775807n.
 *
 * Rejects (rather than coerces) scientific notation, signs, more than seven
 * fractional digits, blanks, and non-strings.
 */
export function parseFixed(value: string): bigint {
  const match = /^(\d+)(?:\.(\d{1,7}))?$/.exec(value);
  if (!match) {
    throw new DecimalFormatError(
      `Invalid decimal value: "${value}" (expected a non-negative decimal with at most 7 fractional digits)`,
    );
  }
  const whole = BigInt(match[1]);
  const fraction = match[2] ? BigInt(match[2].padEnd(FIXED_DECIMALS, '0')) : 0n;
  return whole * FIXED_SCALE + fraction;
}

/**
 * Formats stroops as a decimal string with exactly seven fractional digits.
 * Exact and reversible with `parseFixed`. Handles negative values.
 */
export function formatFixed(value: bigint): string {
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const whole = abs / FIXED_SCALE;
  const fraction = (abs % FIXED_SCALE).toString().padStart(FIXED_DECIMALS, '0');
  return `${negative ? '-' : ''}${whole}.${fraction}`;
}

/** a * b for two fixed-point values. Truncates toward zero at the seventh decimal. */
export function mulFixed(a: bigint, b: bigint): bigint {
  return (a * b) / FIXED_SCALE;
}

/** a / b for two fixed-point values. Truncates toward zero at the seventh decimal. */
export function divFixed(a: bigint, b: bigint): bigint {
  if (b === 0n) {
    throw new DecimalFormatError('Division by zero');
  }
  return (a * FIXED_SCALE) / b;
}

/**
 * Integer division rounded to the nearest whole number, with exact ties rounded
 * AWAY from zero (12.5 -> 13, -12.5 -> -13).
 *
 * Use it to turn an exact ratio into a rounded integer at the API boundary,
 * e.g. `divRound(part * 10_000n, total)` is a percentage in basis points.
 */
export function divRound(numerator: bigint, denominator: bigint): bigint {
  if (denominator === 0n) {
    throw new DecimalFormatError('Division by zero');
  }
  const negative = (numerator < 0n) !== (denominator < 0n);
  const n = numerator < 0n ? -numerator : numerator;
  const d = denominator < 0n ? -denominator : denominator;
  const quotient = (2n * n + d) / (2n * d);
  return negative ? -quotient : quotient;
}
