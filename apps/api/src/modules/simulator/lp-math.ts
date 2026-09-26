/**
 * lp-math.ts – Exact integer arithmetic for Stellar constant-product LP pools.
 *
 * Stellar stores all amounts as 64-bit integers in stroops (1 XLM = 10^7 stroops).
 * All functions here work in *bigint stroops* to avoid floating-point drift.
 *
 * References
 * ──────────
 *  • SEP-0020 / CAP-0038 (constant-product AMM)
 *  • https://stellar.expert/blog/liquidity-pools
 *  • Horizon `/liquidity_pools/{id}` response schema
 */

/** One stroop expressed as a bigint. Used for decimal↔bigint conversion. */
export const STROOP = 10_000_000n; // 10^7

/** Horizon fee is stored as an integer numerator; denominator is always 10000. */
export const FEE_DENOMINATOR = 10_000n;

// ─── helpers ──────────────────────────────────────────────────────────────

/**
 * Parse a decimal string such as "123.4567891" into bigint stroops.
 * Silently truncates beyond 7 decimal places (Stellar's limit).
 */
export function toStroops(decimal: string): bigint {
  const trimmed = decimal.trim();
  const dotIdx = trimmed.indexOf('.');
  if (dotIdx === -1) {
    return BigInt(trimmed) * STROOP;
  }
  const intPart = trimmed.slice(0, dotIdx);
  const fracPart = trimmed.slice(dotIdx + 1, dotIdx + 8).padEnd(7, '0');
  return BigInt(intPart) * STROOP + BigInt(fracPart);
}

/**
 * Format bigint stroops back to a 7-decimal string, e.g. "123.4567891".
 */
export function fromStroops(stroops: bigint): string {
  const abs = stroops < 0n ? -stroops : stroops;
  const sign = stroops < 0n ? '-' : '';
  const intPart = abs / STROOP;
  const fracPart = (abs % STROOP).toString().padStart(7, '0');
  return `${sign}${intPart}.${fracPart}`;
}

/**
 * Integer square root (floor) via Newton's method.
 * Required for the LP share issuance formula.
 */
export function isqrt(n: bigint): bigint {
  if (n < 0n) throw new RangeError('isqrt: negative input');
  if (n === 0n) return 0n;
  let x = n;
  let y = (x + 1n) / 2n;
  while (y < x) {
    x = y;
    y = (x + n / x) / 2n;
  }
  return x;
}

// ─── pool deposit ──────────────────────────────────────────────────────────

export interface DepositInput {
  /** Current A-side reserves (bigint stroops) */
  reserveA: bigint;
  /** Current B-side reserves (bigint stroops) */
  reserveB: bigint;
  /** Total LP shares in circulation (bigint stroops) */
  totalShares: bigint;
  /**
   * A-side deposit amount (bigint stroops).
   * Exactly one of depositA or depositB must be supplied.
   */
  depositA?: bigint;
  /**
   * B-side deposit amount (bigint stroops).
   * Exactly one of depositA or depositB must be supplied.
   */
  depositB?: bigint;
}

export interface DepositResult {
  /** A-side amount that will be taken from the depositor (stroops). */
  depositA: bigint;
  /** B-side amount that will be taken from the depositor (stroops). */
  depositB: bigint;
  /** New LP shares minted to the depositor (stroops). */
  sharesOut: bigint;
  /** Pool fee as a fraction numerator (basis points × 100, i.e. fee_bp / 100). */
  spotPriceAperB: bigint; // A/B price in stroops (price of 1 B expressed in A, ×STROOP)
  spotPriceBperA: bigint; // B/A price in stroops
  /** Percentage price impact (scaled ×10^9 for integer precision). */
  priceImpactPpm: bigint; // parts per million
}

/**
 * Compute a constant-product deposit quote.
 *
 * Stellar pools enforce the constant ratio: depositA / depositB == reserveA / reserveB.
 * If the caller fixes one side, we derive the other using integer division.
 * The caller's dust (rounding remainder) stays in their wallet — the pool
 * never takes more than the ratio allows.
 *
 * Share issuance formula (from CAP-0038):
 *   shares = min(depositA * totalShares / reserveA,
 *                depositB * totalShares / reserveB)
 *
 * For the bootstrap case (totalShares == 0):
 *   shares = isqrt(depositA * depositB)
 */
export function quoteDeposit(input: DepositInput): DepositResult {
  const { reserveA, reserveB, totalShares } = input;

  if (reserveA <= 0n || reserveB <= 0n) {
    throw new RangeError('quoteDeposit: pool reserves must be positive');
  }

  let depositA: bigint;
  let depositB: bigint;

  if (input.depositA !== undefined && input.depositB === undefined) {
    depositA = input.depositA;
    if (depositA <= 0n) throw new RangeError('quoteDeposit: depositA must be positive');
    // depositB = depositA * reserveB / reserveA  (floor)
    depositB = (depositA * reserveB) / reserveA;
    if (depositB === 0n) depositB = 1n; // minimum 1 stroop
  } else if (input.depositB !== undefined && input.depositA === undefined) {
    depositB = input.depositB;
    if (depositB <= 0n) throw new RangeError('quoteDeposit: depositB must be positive');
    depositA = (depositB * reserveA) / reserveB;
    if (depositA === 0n) depositA = 1n;
  } else {
    throw new RangeError('quoteDeposit: supply exactly one of depositA or depositB');
  }

  // ── shares minted ──────────────────────────────────────────────────────
  let sharesOut: bigint;
  if (totalShares === 0n) {
    // bootstrap: geometric mean of deposits
    sharesOut = isqrt(depositA * depositB);
  } else {
    const sharesFromA = (depositA * totalShares) / reserveA;
    const sharesFromB = (depositB * totalShares) / reserveB;
    sharesOut = sharesFromA < sharesFromB ? sharesFromA : sharesFromB;
  }

  if (sharesOut === 0n) {
    throw new RangeError('quoteDeposit: deposit too small — would mint zero shares');
  }

  // ── spot prices ────────────────────────────────────────────────────────
  // spotPriceAperB = reserveA / reserveB expressed with STROOP precision
  const spotPriceAperB = (reserveA * STROOP) / reserveB;
  const spotPriceBperA = (reserveB * STROOP) / reserveA;

  // ── price impact ───────────────────────────────────────────────────────
  // Compare the deposit ratio to the pool ratio:
  // impact = |depositA/depositB - reserveA/reserveB| / (reserveA/reserveB)
  // Expressed in ppm (parts per million) using integer arithmetic.
  const depositRatio = (depositA * STROOP) / depositB;
  const poolRatio = (reserveA * STROOP) / reserveB;
  const diff = depositRatio > poolRatio ? depositRatio - poolRatio : poolRatio - depositRatio;
  const priceImpactPpm = (diff * 1_000_000n) / poolRatio;

  return {
    depositA,
    depositB,
    sharesOut,
    spotPriceAperB,
    spotPriceBperA,
    priceImpactPpm,
  };
}

// ─── pool withdrawal ───────────────────────────────────────────────────────

export interface WithdrawalInput {
  reserveA: bigint;
  reserveB: bigint;
  totalShares: bigint;
  /**
   * LP shares to burn. Exactly one of sharesToBurn / desiredA must be given.
   */
  sharesToBurn?: bigint;
  /**
   * Desired A-side amount. Back-calculates shares needed, then derives B.
   */
  desiredA?: bigint;
}

export interface WithdrawalResult {
  /** Shares burned. */
  sharesToBurn: bigint;
  /** A-side reserves released. */
  reserveAOut: bigint;
  /** B-side reserves released. */
  reserveBOut: bigint;
  /** Pool A/B spot price (stroops). */
  spotPriceAperB: bigint;
  /** Pool B/A spot price (stroops). */
  spotPriceBperA: bigint;
  /** Price impact in parts per million. */
  priceImpactPpm: bigint;
}

/**
 * Compute a constant-product withdrawal quote.
 *
 * Withdrawal formula (CAP-0038):
 *   amountA = sharesToBurn * reserveA / totalShares
 *   amountB = sharesToBurn * reserveB / totalShares
 *
 * Price impact is calculated as the shift in pool spot price after the
 * withdrawal (new ratio vs current ratio).
 */
export function quoteWithdrawal(input: WithdrawalInput): WithdrawalResult {
  const { reserveA, reserveB, totalShares } = input;

  if (totalShares <= 0n) {
    throw new RangeError('quoteWithdrawal: pool has no shares (empty pool)');
  }
  if (reserveA <= 0n || reserveB <= 0n) {
    throw new RangeError('quoteWithdrawal: pool reserves must be positive');
  }

  let sharesToBurn: bigint;

  if (input.sharesToBurn !== undefined && input.desiredA === undefined) {
    sharesToBurn = input.sharesToBurn;
    if (sharesToBurn <= 0n) throw new RangeError('quoteWithdrawal: sharesToBurn must be positive');
    if (sharesToBurn > totalShares) throw new RangeError('quoteWithdrawal: sharesToBurn exceeds totalShares');
  } else if (input.desiredA !== undefined && input.sharesToBurn === undefined) {
    const desiredA = input.desiredA;
    if (desiredA <= 0n) throw new RangeError('quoteWithdrawal: desiredA must be positive');
    if (desiredA > reserveA) throw new RangeError('quoteWithdrawal: desiredA exceeds pool reserves');
    // shares = desiredA * totalShares / reserveA  (ceiling to ensure we get at least desiredA)
    sharesToBurn = (desiredA * totalShares + reserveA - 1n) / reserveA;
    if (sharesToBurn > totalShares) sharesToBurn = totalShares;
  } else {
    throw new RangeError('quoteWithdrawal: supply exactly one of sharesToBurn or desiredA');
  }

  const reserveAOut = (sharesToBurn * reserveA) / totalShares;
  const reserveBOut = (sharesToBurn * reserveB) / totalShares;

  if (reserveAOut === 0n && reserveBOut === 0n) {
    throw new RangeError('quoteWithdrawal: shares too small — would release zero reserves');
  }

  // spot prices before withdrawal
  const spotPriceAperB = (reserveA * STROOP) / reserveB;
  const spotPriceBperA = (reserveB * STROOP) / reserveA;

  // price impact: post-withdrawal spot ratio shift
  const newReserveA = reserveA - reserveAOut;
  const newReserveB = reserveB - reserveBOut;

  let priceImpactPpm = 0n;
  if (newReserveA > 0n && newReserveB > 0n) {
    const newSpot = (newReserveA * STROOP) / newReserveB;
    const diff =
      newSpot > spotPriceAperB ? newSpot - spotPriceAperB : spotPriceAperB - newSpot;
    priceImpactPpm = (diff * 1_000_000n) / spotPriceAperB;
  }

  return {
    sharesToBurn,
    reserveAOut,
    reserveBOut,
    spotPriceAperB,
    spotPriceBperA,
    priceImpactPpm,
  };
}

// ─── fee helpers ───────────────────────────────────────────────────────────

/**
 * Convert a Horizon fee integer (e.g. 30 for 0.30%) to a human-readable string.
 * Horizon stores fee as basis-points × 100, i.e. fee_bp = feeInt / 100.
 * Example: feeInt=30 → "0.30%"
 */
export function formatPoolFee(feeInt: number): string {
  const bps = feeInt / 100;
  return `${bps.toFixed(2)}%`;
}

/**
 * Return the effective fee fraction as a numerator over FEE_DENOMINATOR (10000).
 * Used for downstream "fee removed from output" calculations.
 */
export function feeNumerator(feeInt: number): bigint {
  return BigInt(feeInt);
}

// ─── bounded amounts ───────────────────────────────────────────────────────

/**
 * Apply a slippage tolerance to a deposit: returns the minimum shares
 * the caller should accept, expressed in stroops.
 * minShares = sharesOut * (1 - slippagePct/100)
 */
export function depositMinShares(sharesOut: bigint, slippagePct: number): bigint {
  if (slippagePct < 0 || slippagePct > 100) {
    throw new RangeError('depositMinShares: slippagePct must be between 0 and 100');
  }
  const multiplier = BigInt(Math.round((1 - slippagePct / 100) * 1_000_000));
  return (sharesOut * multiplier) / 1_000_000n;
}

/**
 * Apply a slippage tolerance to a withdrawal: returns the minimum A and B
 * amounts the caller should accept.
 */
export function withdrawalMinAmounts(
  reserveAOut: bigint,
  reserveBOut: bigint,
  slippagePct: number,
): { minA: bigint; minB: bigint } {
  if (slippagePct < 0 || slippagePct > 100) {
    throw new RangeError('withdrawalMinAmounts: slippagePct must be between 0 and 100');
  }
  const multiplier = BigInt(Math.round((1 - slippagePct / 100) * 1_000_000));
  return {
    minA: (reserveAOut * multiplier) / 1_000_000n,
    minB: (reserveBOut * multiplier) / 1_000_000n,
  };
}

/**
 * Parse a pool fee from the Horizon LP record.
 * Horizon returns fee_bp as an integer: 30 = 0.30%.
 */
export function parseHorizonFee(feeBp: string | number): number {
  const n = typeof feeBp === 'string' ? parseInt(feeBp, 10) : feeBp;
  if (!Number.isFinite(n) || n < 0) {
    throw new RangeError(`parseHorizonFee: invalid fee value "${feeBp}"`);
  }
  return n;
}
