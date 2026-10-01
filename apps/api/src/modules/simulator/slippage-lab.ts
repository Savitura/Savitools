/**
 * slippage-lab.ts – exact integer arithmetic for the path-payment lab
 * (Savitura/Savitools#351).
 *
 * A path payment does not lock a rate: the transaction carries a tolerance
 * (`destinationMin` for strict send, `sendMax` for strict receive) and the
 * network fails the operation when the live route cannot fill inside it. This
 * module answers the question the tolerance raises — *how much rate movement
 * can this tolerance absorb before the payment fails?* — for several
 * tolerances at once, so they can be compared side by side.
 *
 * Stellar stores every amount as a 64-bit integer in stroops (1 XLM = 10^7
 * stroops), so all amount maths here runs on `bigint` and all percentage maths
 * on `bigint` hundredths of a percent. Nothing in this module ever puts an
 * amount in a `number`: that is what keeps a 0.1% tolerance off a float
 * rounding error at the 7th decimal.
 *
 * Formulas (the ones the SDK bakes into the operation):
 *   strict_send     destinationMin = floor(variable × (1 − s))
 *   strict_receive  sendMax        = ceil(variable × (1 + s))
 *   worst case      strict_send: floor(variable × (1 − m))
 *                   strict_receive: ceil(variable × (1 + m))
 *
 * where `s` is the slippage tolerance and `m` the simulated adverse rate move,
 * both as fractions. `floor` is used on the way down and `ceil` on the way up,
 * so the lab never reports a guarantee the network would reject.
 *
 * `headroom` is signed so that positive always means "this tolerance clears the
 * move", which is why the two directions subtract differently: a
 * `destinationMin` is a floor the fill has to stay *above*, so the slack is
 * `worstCase − guarantee`, while a `sendMax` is a ceiling the fill has to stay
 * *below*, so the slack is `guarantee − worstCase`.
 *
 * Everything returned is a string or a number. A `bigint` left in the result
 * would make `JSON.stringify` throw, which is why the internal bigint shape
 * never escapes this module.
 *
 * References
 *  • SEP-0029 (path payments) — https://stellar.org/protocol/sep-29
 *  • Horizon `/paths/strict_send` and `/paths/strict_receive` response shapes
 */

import { fromStroops, toStroops } from './lp-math';

/** 100% in hundredths of a percent. */
export const FULL_SCALE_BPS = 10_000n;

/** Parts per million, used for percentages reported to four decimal places. */
const PER_MILLION = 1_000_000n;

/** The tolerance fields a path payment carries, keyed by direction. */
export const GUARANTEE_FIELD = {
  strict_send: 'destinationMin',
  strict_receive: 'sendMax',
} as const;

export type SlippageDirection = keyof typeof GUARANTEE_FIELD;
export type SlippageGuaranteeField = (typeof GUARANTEE_FIELD)[SlippageDirection];

/**
 * `exact` is not a pass: the move and the tolerance landed on the same amount,
 * so the transaction clears only if the rate does not move by another stroop.
 */
export type SlippageVerdict = 'pass' | 'fail' | 'exact';

// ─── percentage helpers ────────────────────────────────────────────────────

/**
 * Convert a percentage to hundredths of a percent.
 *
 * A percentage of at most two decimals round-trips exactly, which is why the
 * DTO floors the accepted tolerances at 0.01: a finer one would collapse to
 * zero and then be reported as "no tolerance at all".
 */
export function percentToBps(percent: number): bigint {
  if (!Number.isFinite(percent)) {
    throw new RangeError('percentToBps: percent must be a finite number');
  }
  const scaled = Math.round(percent * 100);
  if (scaled < 0) {
    throw new RangeError('percentToBps: percent must not be negative');
  }
  return BigInt(scaled);
}

/** Inverse of `percentToBps`: hundredths of a percent back to a percentage. */
export function bpsToPercent(bps: bigint): number {
  if (bps < 0n) throw new RangeError('bpsToPercent: bps must not be negative');
  return roundTo(Number(bps) / 100, 2);
}

/** Round half-away-from-zero so `x.5` never rounds to the even neighbour. */
export function roundTo(value: number, decimals: number): number {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** decimals;
  return (value < 0 ? -1 : 1) * (Math.round(Math.abs(value) * factor) / factor);
}

/**
 * `part / whole` as a percentage at `decimals` places.
 *
 * The division runs in parts per million and rounds to nearest, so a ratio
 * that is not exactly representable is reported to four decimals instead of
 * being truncated to a whole hundredth of a percent. The verdict itself never
 * depends on this — it is decided on the exact bigint headroom — so rounding
 * here is cosmetic rather than load-bearing.
 */
function percentOf(part: bigint, whole: bigint, decimals: number): number {
  if (whole === 0n) return 0;
  const negative = part < 0n;
  const magnitude = negative ? -part : part;
  const ppm = (magnitude * PER_MILLION * 2n + whole) / (whole * 2n);
  return roundTo((negative ? -1 : 1) * (Number(ppm) / 10_000), decimals);
}

/** `amount × bps / 10000`, rounded down. */
export function scaleDown(amount: bigint, bps: bigint): bigint {
  return checkedScale(amount, bps) / FULL_SCALE_BPS;
}

/** `amount × bps / 10000`, rounded up. */
export function scaleUp(amount: bigint, bps: bigint): bigint {
  const product = checkedScale(amount, bps);
  return (product + FULL_SCALE_BPS - 1n) / FULL_SCALE_BPS;
}

function checkedScale(amount: bigint, bps: bigint): bigint {
  if (amount < 0n) throw new RangeError('scale: amount must not be negative');
  if (bps < 0n) throw new RangeError('scale: bps must not be negative');
  return amount * bps;
}

/** Parse a Stellar amount string into stroops, rejecting anything unparseable. */
export function parseLabAmount(value: string, label = 'amount'): bigint {
  if (!/^(?:0|[1-9]\d{0,14})(?:\.\d{1,7})?$/.test(value.trim())) {
    throw new RangeError(`${label} is not a valid Stellar amount: "${value}"`);
  }
  const stroops = toStroops(value);
  if (stroops < 0n) throw new RangeError(`${label} must not be negative: "${value}"`);
  return stroops;
}

// ─── comparison ────────────────────────────────────────────────────────────

export interface SlippageComparisonInput {
  direction: SlippageDirection;
  /**
   * The leg the transaction pins exactly: the source amount for `strict_send`,
   * the destination amount for `strict_receive`.
   */
  fixedAmountStroops: bigint;
  /**
   * The leg the network prices at fill time: the destination amount for
   * `strict_send`, the source amount for `strict_receive`.
   */
  variableAmountStroops: bigint;
  /** Tolerances to price side by side, as percentages. */
  slippageScenarios: number[];
  /** Simulated adverse rate move between quote and landing, as a percentage. */
  adverseMovePercent: number;
  /**
   * The best route's variable amount, when comparing a non-best route. Used to
   * report how much worse the chosen route already is before any move.
   */
  bestVariableAmountStroops?: bigint;
}

export interface SlippageScenarioOutcome {
  slippagePercent: number;
  /** The value to submit in the operation's `guaranteeField`. */
  guarantee: string;
  /** The variable leg once the simulated adverse move has been applied. */
  adverseAmount: string;
  /** Positive when the tolerance clears the move, negative when it fails. */
  headroom: string;
  /** `headroom` as a percentage of the quoted variable amount. */
  headroomPercent: number;
  /** The adverse move this tolerance absorbs, as a percentage. */
  tolerableMovePercent: number;
  verdict: SlippageVerdict;
}

export interface SlippageComparisonResult {
  direction: SlippageDirection;
  /** `destinationMin` for `strict_send`, `sendMax` for `strict_receive`. */
  guaranteeField: SlippageGuaranteeField;
  /** The pinned leg, as a 7-decimal string. */
  fixedAmount: string;
  /** The quoted variable leg, as a 7-decimal string. */
  quotedVariableAmount: string;
  adverseMovePercent: number;
  /** The variable leg at the simulated adverse move, as a 7-decimal string. */
  adverseVariableAmount: string;
  scenarios: SlippageScenarioOutcome[];
  /** The tightest compared tolerance. */
  tightestSlippagePercent: number;
  /** The loosest compared tolerance. */
  widestSlippagePercent: number;
  /**
   * The narrowest compared tolerance that still absorbs the simulated move, or
   * `null` when every compared tolerance is exceeded by it.
   */
  recommendedSlippagePercent: number | null;
  /** `recommendedSlippagePercent − adverseMovePercent`. */
  recommendedHeadroomPercent: number | null;
  /** True when no compared tolerance absorbs the simulated move. */
  exceededByEveryScenario: boolean;
  /**
   * How far the chosen route already sits below the best route, as a
   * percentage. `null` when no best route was supplied.
   */
  routeDispersionPercent: number | null;
}

/**
 * Price every tolerance against a single simulated adverse move.
 *
 * Tolerances come back ascending and de-duplicated, so a caller can render a
 * stable comparison table and read the recommendation off the first row.
 */
export function compareSlippageScenarios(
  input: SlippageComparisonInput,
): SlippageComparisonResult {
  const { direction } = input;
  const { variable: variableStroops, fixed: fixedStroops } = readLegs(input);

  if (input.slippageScenarios.length === 0) {
    throw new RangeError('compareSlippageScenarios: at least one scenario is required');
  }

  const moveBps = readPercent(input.adverseMovePercent, 'adverseMovePercent');
  const uniqueBps = [
    ...new Set(input.slippageScenarios.map((percent) => readPercent(percent, 'slippageScenarios'))),
  ].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));

  const adverseAmountStroops = adverseVariableAmount(direction, variableStroops, moveBps);

  const scenarios: SlippageScenarioOutcome[] = uniqueBps.map((bps) => {
    const guaranteeStroops = guaranteeAmount(direction, variableStroops, bps);
    const headroomStroops =
      direction === 'strict_send'
        ? adverseAmountStroops - guaranteeStroops
        : guaranteeStroops - adverseAmountStroops;

    return {
      slippagePercent: bpsToPercent(bps),
      guarantee: fromStroops(guaranteeStroops),
      adverseAmount: fromStroops(adverseAmountStroops),
      headroom: fromStroops(headroomStroops),
      headroomPercent: percentOf(headroomStroops, variableStroops, 4),
      tolerableMovePercent: bpsToPercent(bps),
      verdict:
        headroomStroops > 0n ? 'pass' : headroomStroops < 0n ? 'fail' : 'exact',
    };
  });

  // The narrowest tolerance that still covers the move: headroom beyond what the
  // move needs is unspent risk, so the first passing row is the answer.
  const recommended = scenarios.find(
    (scenario) => percentToBps(scenario.slippagePercent) >= moveBps,
  );

  return {
    direction,
    guaranteeField: GUARANTEE_FIELD[direction],
    fixedAmount: fromStroops(fixedStroops),
    quotedVariableAmount: fromStroops(variableStroops),
    adverseMovePercent: bpsToPercent(moveBps),
    adverseVariableAmount: fromStroops(adverseAmountStroops),
    scenarios,
    tightestSlippagePercent: bpsToPercent(uniqueBps[0]),
    widestSlippagePercent: bpsToPercent(uniqueBps[uniqueBps.length - 1]),
    recommendedSlippagePercent: recommended ? recommended.slippagePercent : null,
    recommendedHeadroomPercent: recommended
      ? roundTo(recommended.slippagePercent - bpsToPercent(moveBps), 4)
      : null,
    exceededByEveryScenario: recommended === undefined,
    routeDispersionPercent: routeDispersionPercent(
      direction,
      variableStroops,
      input.bestVariableAmountStroops,
    ),
  };
}

/** The tolerance field value a transaction would carry for one tolerance. */
export function guaranteeAmount(
  direction: SlippageDirection,
  variableAmountStroops: bigint,
  slippageBps: bigint,
): bigint {
  if (slippageBps > FULL_SCALE_BPS) {
    throw new RangeError('slippageBps: must not exceed 100%');
  }
  return direction === 'strict_send'
    ? scaleDown(variableAmountStroops, FULL_SCALE_BPS - slippageBps)
    : scaleUp(variableAmountStroops, FULL_SCALE_BPS + slippageBps);
}

/** The variable leg once the simulated adverse move has been applied. */
export function adverseVariableAmount(
  direction: SlippageDirection,
  variableAmountStroops: bigint,
  moveBps: bigint,
): bigint {
  if (moveBps > FULL_SCALE_BPS) {
    throw new RangeError('moveBps: must not exceed 100%');
  }
  return direction === 'strict_send'
    ? scaleDown(variableAmountStroops, FULL_SCALE_BPS - moveBps)
    : scaleUp(variableAmountStroops, FULL_SCALE_BPS + moveBps);
}

function readLegs(input: SlippageComparisonInput): {
  fixed: bigint;
  variable: bigint;
} {
  if (input.variableAmountStroops < 0n) {
    throw new RangeError('variableAmountStroops must not be negative');
  }
  if (input.fixedAmountStroops < 0n) {
    throw new RangeError('fixedAmountStroops must not be negative');
  }
  return { fixed: input.fixedAmountStroops, variable: input.variableAmountStroops };
}

function readPercent(percent: number, label: string): bigint {
  try {
    const bps = percentToBps(percent);
    if (bps > FULL_SCALE_BPS) {
      throw new RangeError(`${label}: must not exceed 100%`);
    }
    return bps;
  } catch (error: unknown) {
    if (error instanceof RangeError && error.message.includes('must not exceed')) {
      throw error;
    }
    throw new RangeError(`${label} must be a percentage between 0 and 100`);
  }
}

/**
 * How far the chosen route already sits below the best route, as a percentage
 * of the best route.
 *
 * "Below" depends on the direction, which is why this cannot be a plain
 * subtraction: the variable leg is the destination for `strict_send`, where more
 * is better, and the source for `strict_receive`, where less is better. A route
 * at least as good as the reference is not behind, so it reads as zero.
 */
export function routeDispersionPercent(
  direction: SlippageDirection,
  variableAmountStroops: bigint,
  bestVariableAmountStroops: bigint | undefined,
): number | null {
  if (bestVariableAmountStroops === undefined) return null;
  if (bestVariableAmountStroops < 0n) {
    throw new RangeError('bestVariableAmountStroops must not be negative');
  }
  const behind =
    direction === 'strict_send'
      ? bestVariableAmountStroops - variableAmountStroops
      : variableAmountStroops - bestVariableAmountStroops;
  if (behind <= 0n) return 0;

  return percentOf(behind, bestVariableAmountStroops, 4);
}
