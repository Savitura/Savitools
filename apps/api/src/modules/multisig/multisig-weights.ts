/**
 * multisig-weights.ts – exact integer arithmetic for the multisig signer-weight
 * and threshold simulator (Savitura/Savitools#352).
 *
 * A Stellar account is a *weighted* multisig: every signer carries a weight
 * between 0 and 255, and an operation is authorised once the signatures that
 * arrive total at least the relevant threshold (`low` for the small
 * operations, `medium` for payments and path payments, `high` for account
 * settings and clawbacks). Two questions follow from that, and both are pure
 * arithmetic over integers:
 *
 *  1. With the signatures collected so far, is the operation authorised, and
 *     which weight classes are cleared?
 *  2. Which signers still have to sign, i.e. what is the *smallest* set of
 *     outstanding signers that would reach the threshold?
 *
 * (2) is a subset-sum problem, so it is solved exactly with a dynamic program
 * over reachable weights rather than a greedy pass. Weights are bounded at 255
 * per signer and the request is bounded at `MAX_SIGNERS` signers, so the state
 * space is at most 255 × `MAX_SIGNERS` cells — exact minimality is cheap here,
 * and "closest to threshold" greedy answers are wrong often enough (one weight
 * 60 plus two weight 20 will not reach 100, but the greedy pass suggests it)
 * that approximating would be the wrong call.
 *
 * References
 *  • SEP-0023 (multisig) — https://stellar.org/protocol/sep-23
 *  • Horizon `/accounts/{id}` signer and threshold fields
 */

/** A signer's weight can never exceed the `uint8` the XDR uses. */
export const MAX_SIGNER_WEIGHT = 255;

/**
 * Stellar's SEP-0023 caps an account at 20 additional signers on top of the
 * master key. The request may describe the master key too, so the accepted
 * list is one longer.
 */
export const MAX_SIGNERS = 21;

/** The three weight classes an account can gate operations behind. */
export const OPERATION_THRESHOLDS = ['low', 'medium', 'high'] as const;

export type OperationThresholdKind = (typeof OPERATION_THRESHOLDS)[number];

/** Risk codes are stable identifiers so clients can branch on them. */
export type MultisigRiskCode =
  | 'THRESHOLD_UNREACHABLE'
  | 'THRESHOLD_ZERO'
  | 'SINGLE_SIGNER_CONTROLS'
  | 'REQUIRES_EVERY_SIGNER'
  | 'REQUIRED_SIGNER_MISSING'
  | 'REQUIRED_SIGNER_UNSIGNED'
  | 'ZERO_WEIGHT_SIGNERS'
  | 'REDUNDANT_SIGNER'
  | 'QUORUM_SINGLE_POINT_OF_FAILURE'
  | 'DUPLICATE_SIGNER'
  | 'THRESHOLD_ABOVE_TOTAL_WEIGHT';

export type MultisigRiskSeverity = 'critical' | 'warning' | 'info';

export interface MultisigRisk {
  code: MultisigRiskCode;
  severity: MultisigRiskSeverity;
  message: string;
  /** Signer keys the finding is about, when it is about specific signers. */
  signers?: string[];
}

export interface MultisigSignerInput {
  key: string;
  /** Weight this signer contributes, 0–255. */
  weight: number;
  /** Whether a signature from this signer is already collected. */
  signed: boolean;
  /**
   * A master-weight-0 "required" signer: the account cannot be modified at
   * all while the key is absent, and its weight is 0 by definition.
   */
  required?: boolean;
}

export interface MultisigSimulationInput {
  /** Weight the operation needs, 0–255. */
  threshold: number;
  signers: MultisigSignerInput[];
  /** `low` weight class; defaults to `threshold` (Stellar's own default). */
  lowThreshold?: number;
  /** `high` weight class; defaults to `threshold`. */
  highThreshold?: number;
  /**
   * Lower bound of the transaction's validity window (unix seconds or an ISO
   * 8601 timestamp). `null` means "valid from now".
   */
  minTime?: number | null;
  /** Upper bound of the validity window. `null` means "no expiry". */
  maxTime?: number | null;
  /** `now` in unix seconds; defaults to the wall clock. */
  now?: number;
}

export interface MultisigSignerOutcome {
  key: string;
  weight: number;
  signed: boolean;
  required: boolean;
  /** Share of the account's total weight, as a percentage. */
  shareOfTotalPercent: number;
  /** Share of the weight the operation needs, as a percentage. */
  shareOfThresholdPercent: number;
  /** This signer alone reaches the threshold. */
  controlsAccount: boolean;
  /**
   * Without this signer the remaining weight cannot reach the threshold, so
   * the multisig stalls unless it signs.
   */
  indispensable: boolean;
  /** Dropping this signer leaves the remaining signers above the threshold. */
  redundant: boolean;
}

export interface MultisigThresholdOutcome {
  kind: OperationThresholdKind;
  /** The weight this class needs. */
  requiredWeight: number;
  /** The weight actually collected. */
  collectedWeight: number;
  /** `requiredWeight − collectedWeight`, floored at zero. */
  deficit: number;
  cleared: boolean;
}

export interface MultisigSimulationResult {
  threshold: number;
  lowThreshold: number;
  mediumThreshold: number;
  highThreshold: number;
  totalWeight: number;
  signedWeight: number;
  /** Weight still missing, floored at zero. */
  deficit: number;
  /** Weight collected beyond the threshold, floored at zero. */
  surplus: number;
  /** `min(signedWeight / threshold, 1)`, as a percentage. */
  progressPercent: number;
  /** `signedWeight >= threshold`. */
  satisfied: boolean;
  /**
   * `satisfied` and every required signer has signed. A missing required
   * signer blocks the account regardless of collected weight.
   */
  canSubmit: boolean;
  signers: MultisigSignerOutcome[];
  operationThresholds: MultisigThresholdOutcome[];
  /** Required signers whose signature is still outstanding. */
  outstandingRequiredSigners: string[];
  /**
   * The smallest set of outstanding signers whose weights would reach the
   * threshold, or `null` when even signing all of them would not be enough.
   * Empty when the threshold is already satisfied.
   */
  minimumSignersNeeded: string[] | null;
  /** Weight the minimum set contributes on top of what is already collected. */
  minimumSetWeight: number;
  /** Distinct keys that appear more than once in the request. */
  duplicateSigners: string[];
  risks: MultisigRisk[];
  timeBounds: {
    minTime: number | null;
    maxTime: number | null;
    /** `now` is before `minTime`. */
    notYetActive: boolean;
    /** `now` is after `maxTime`. */
    expired: boolean;
    /** The window is present and `now` is outside it. */
    invalid: boolean;
  };
}

// ─── validation ────────────────────────────────────────────────────────────

function assertWeight(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0 || value > MAX_SIGNER_WEIGHT) {
    throw new RangeError(
      `${label} must be an integer between 0 and ${MAX_SIGNER_WEIGHT}`,
    );
  }
}

function assertThreshold(value: number, label: string): void {
  assertWeight(value, label);
}

// ─── simulation ────────────────────────────────────────────────────────────

/**
 * Evaluate a multisig configuration against the signatures collected so far.
 *
 * Pure: it reads no clock unless the caller supplies one, so the same input
 * always produces the same result and the suite can pin every boundary.
 */
export function simulateMultisig(input: MultisigSimulationInput): MultisigSimulationResult {
  const { threshold, signers } = input;
  assertThreshold(threshold, 'threshold');

  if (signers.length > MAX_SIGNERS) {
    throw new RangeError(`signers must hold at most ${MAX_SIGNERS} entries`);
  }

  const lowThreshold = input.lowThreshold ?? threshold;
  const highThreshold = input.highThreshold ?? threshold;
  assertThreshold(lowThreshold, 'lowThreshold');
  assertThreshold(highThreshold, 'highThreshold');

  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const signer of signers) {
    if (seen.has(signer.key)) duplicates.add(signer.key);
    seen.add(signer.key);
    assertWeight(signer.weight, `signer ${signer.key} weight`);
    if (signer.required && signer.weight !== 0) {
      throw new RangeError(`signer ${signer.key} is required and must have weight 0`);
    }
  }

  const totalWeight = signers.reduce((sum, signer) => sum + signer.weight, 0);
  const signedWeight = signers
    .filter((signer) => signer.signed)
    .reduce((sum, signer) => sum + signer.weight, 0);
  const deficit = Math.max(0, threshold - signedWeight);
  const surplus = Math.max(0, signedWeight - threshold);
  const satisfied = signedWeight >= threshold;

  const operationThresholds: MultisigThresholdOutcome[] = (
    [
      ['low', lowThreshold],
      ['medium', threshold],
      ['high', highThreshold],
    ] as const
  ).map(([kind, requiredWeight]) => ({
    kind,
    requiredWeight,
    collectedWeight: signedWeight,
    deficit: Math.max(0, requiredWeight - signedWeight),
    cleared: signedWeight >= requiredWeight,
  }));

  const signerOutcomes = buildSignerOutcomes(signers, totalWeight, threshold);
  const outstandingRequiredSigners = signers
    .filter((signer) => signer.required && !signer.signed)
    .map((signer) => signer.key);
  const canSubmit = satisfied && outstandingRequiredSigners.length === 0;

  const outstanding = signers.filter((signer) => !signer.signed);
  const minimumSignersNeeded = satisfied
    ? []
    : solveMinimumSigners(outstanding, threshold - signedWeight);

  return {
    threshold,
    lowThreshold,
    mediumThreshold: threshold,
    highThreshold,
    totalWeight,
    signedWeight,
    deficit,
    surplus,
    progressPercent:
      threshold === 0
        ? 100
        : Math.min(100, Math.round((signedWeight / threshold) * 10_000) / 100),
    satisfied,
    canSubmit,
    signers: signerOutcomes,
    operationThresholds,
    outstandingRequiredSigners,
    minimumSignersNeeded,
    minimumSetWeight: minimumSignersNeeded
      ? minimumSignersNeeded.reduce((sum, key) => {
          const signer = signers.find((entry) => entry.key === key);
          return sum + (signer ? signer.weight : 0);
        }, 0)
      : 0,
    duplicateSigners: [...duplicates].sort(),
    risks: collectRisks({
      threshold,
      signers,
      totalWeight,
      outstandingRequiredSigners,
      duplicateSigners: [...duplicates].sort(),
      minimumSignersNeeded,
    }),
    timeBounds: evaluateTimeBounds(input),
  };
}

/**
 * Per-signer standing, read from the *configured* set rather than the
 * signatures collected so far: `indispensable` and `redundant` answer "what
 * happens to this account if that key is removed", which is what an operator
 * designing the quorum needs. Who still has to sign is answered separately by
 * `minimumSignersNeeded`.
 */
function buildSignerOutcomes(
  signers: MultisigSignerInput[],
  totalWeight: number,
  threshold: number,
): MultisigSignerOutcome[] {
  return signers.map((signer) => {
    const remaining = totalWeight - signer.weight;
    return {
      key: signer.key,
      weight: signer.weight,
      signed: signer.signed,
      required: signer.required ?? false,
      shareOfTotalPercent: percentOf(signer.weight, totalWeight),
      shareOfThresholdPercent: percentOf(signer.weight, threshold),
      controlsAccount: threshold > 0 && signer.weight >= threshold,
      indispensable: remaining < threshold,
      redundant: remaining >= threshold,
    };
  });
}

function percentOf(part: number, whole: number): number {
  if (whole === 0) return 0;
  return Math.round((part / whole) * 10_000) / 100;
}

/**
 * The smallest set of `signers` whose weights total at least `deficit`, with
 * ties broken so the answer overshoots the threshold as little as possible.
 *
 * A descending greedy pass is already minimal by count — the k largest weights
 * sum to the maximum any k signers can reach — but it returns whichever minimal
 * combination it hits first, which need not be the tightest fit. A 0/1 knapsack
 * over reachable weights keeps the best solution for *every* weight and then
 * selects on (fewest signers, smallest total, lexicographic keys), so "who
 * still has to sign" never commits more weight than the quorum needs. Weights
 * are bounded at 255 per signer and the request at 21 signers, so the exact
 * search is a few thousand cells.
 *
 * `null` means the available weight cannot cover the deficit at all.
 */
export function solveMinimumSigners(
  signers: MultisigSignerInput[],
  deficit: number,
): string[] | null {
  if (deficit <= 0) return [];
  const total = signers.reduce((sum, signer) => sum + signer.weight, 0);
  if (total < deficit) return null;

  const sorted = [...signers].sort((left, right) =>
    left.weight === right.weight
      ? left.key.localeCompare(right.key)
      : right.weight - left.weight,
  );

  // `best[weight]` is the key list reaching exactly `weight` with the fewest
  // signers seen so far. Each signer is read from a snapshot of the map, so no
  // key can be counted twice, and the ascending key order makes the stored list
  // the lexicographically smallest of the equal-length solutions.
  const best = new Map<number, string[]>();
  best.set(0, []);

  for (const signer of sorted) {
    if (signer.weight === 0) continue;
    const snapshot = [...best.entries()];
    for (const [weight, keys] of snapshot) {
      const reached = weight + signer.weight;
      if (reached > total) continue;
      const candidate = [...keys, signer.key].sort();
      const incumbent = best.get(reached);
      if (!incumbent || compareSolutions(candidate, incumbent) < 0) {
        best.set(reached, candidate);
      }
    }
  }

  // Every reachable weight at or above the deficit is a candidate; the fewest
  // signers wins, and equal counts are broken by the smallest overshoot so the
  // recommendation overshoots the threshold as little as possible.
  let winner: string[] | null = null;
  let winnerWeight = Number.POSITIVE_INFINITY;
  for (const [weight, keys] of best) {
    if (weight < deficit) continue;
    if (winner === null || compareSolutions(keys, winner) < 0 ||
      (keys.length === winner.length && weight < winnerWeight)) {
      winner = keys;
      winnerWeight = weight;
    }
  }
  return winner;
}

/** Fewer signers wins; equal counts fall back to the lexicographic order. */
function compareSolutions(left: string[], right: string[]): number {
  if (left.length !== right.length) return left.length - right.length;
  return left.join(' ').localeCompare(right.join(' '));
}

// ─── risk analysis ─────────────────────────────────────────────────────────

interface RiskContext {
  threshold: number;
  signers: MultisigSignerInput[];
  totalWeight: number;
  outstandingRequiredSigners: string[];
  duplicateSigners: string[];
  minimumSignersNeeded: string[] | null;
}

function collectRisks(context: RiskContext): MultisigRisk[] {
  const {
    threshold,
    signers,
    totalWeight,
    outstandingRequiredSigners,
    duplicateSigners,
    minimumSignersNeeded,
  } = context;
  const risks: MultisigRisk[] = [];
  const weighted = signers.filter((signer) => signer.weight > 0);

  // A weighted signer is redundant when the account still reaches the
  // threshold without it, and indispensable when it does not. Both read the
  // configured set, not the collected signatures.
  const redundant = weighted.filter(
    (signer) => totalWeight - signer.weight >= threshold,
  );
  const everySignerRequired =
    weighted.length > 0 && weighted.every((signer) => totalWeight - signer.weight < threshold);

  if (threshold === 0) {
    risks.push({
      code: 'THRESHOLD_ZERO',
      severity: 'critical',
      message:
        'A threshold of 0 authorises the operation without any signature, so the account is not actually protected.',
    });
  }

  if (totalWeight === 0) {
    risks.push({
      code: 'THRESHOLD_UNREACHABLE',
      severity: 'critical',
      message:
        'No signer carries weight, so no set of signatures can reach a threshold of 1 or more.',
    });
  } else if (totalWeight < threshold) {
    risks.push({
      code: 'THRESHOLD_ABOVE_TOTAL_WEIGHT',
      severity: 'critical',
      message: `Total weight ${totalWeight} is below the threshold of ${threshold}, so the operation can never be authorised.`,
    });
  }

  const controller = weighted.find(
    (signer) => threshold > 0 && signer.weight >= threshold,
  );
  if (controller) {
    risks.push({
      code: 'SINGLE_SIGNER_CONTROLS',
      severity: 'warning',
      message: `Signer weight ${controller.weight} alone reaches the threshold of ${threshold}.`,
      signers: [controller.key],
    });
  }

  if (everySignerRequired) {
    risks.push({
      code: 'REQUIRES_EVERY_SIGNER',
      severity: 'warning',
      message:
        'Every weighted signer has to sign: removing any one of them leaves the account below the threshold.',
    });
  }

  if (
    minimumSignersNeeded &&
    minimumSignersNeeded.length === 1 &&
    weighted.length > 1
  ) {
    risks.push({
      code: 'QUORUM_SINGLE_POINT_OF_FAILURE',
      severity: 'warning',
      message:
        'A single outstanding signature completes the quorum, so that signer can stall the account on its own.',
      signers: minimumSignersNeeded,
    });
  }

  if (outstandingRequiredSigners.length > 0) {
    risks.push({
      code: 'REQUIRED_SIGNER_UNSIGNED',
      severity: 'critical',
      message: `Required ${outstandingRequiredSigners.length === 1 ? 'signer is' : 'signers are'} still outstanding: the account cannot be modified until they sign.`,
      signers: outstandingRequiredSigners,
    });
  }

  const zeroWeight = signers
    .filter((signer) => !signer.required && signer.weight === 0)
    .map((signer) => signer.key);
  if (zeroWeight.length > 0) {
    risks.push({
      code: 'ZERO_WEIGHT_SIGNERS',
      severity: 'info',
      message:
        'Zero-weight signers are recorded on the account but add no weight to the quorum.',
      signers: zeroWeight,
    });
  }

  if (redundant.length > 0) {
    risks.push({
      code: 'REDUNDANT_SIGNER',
      severity: 'info',
      message: `Dropping ${redundant.length === 1 ? 'this signer' : 'these signers'} leaves the remaining weight at or above the threshold.`,
      signers: redundant.map((signer) => signer.key),
    });
  }

  if (duplicateSigners.length > 0) {
    risks.push({
      code: 'DUPLICATE_SIGNER',
      severity: 'warning',
      message:
        'The same key appears more than once. Stellar counts each key once, so the duplicates inflate the totals in this simulation only.',
      signers: duplicateSigners,
    });
  }

  const order: Record<MultisigRiskSeverity, number> = { critical: 0, warning: 1, info: 2 };
  return risks.sort((left, right) => order[left.severity] - order[right.severity]);
}

// ─── time bounds ───────────────────────────────────────────────────────────

function evaluateTimeBounds(
  input: MultisigSimulationInput,
): MultisigSimulationResult['timeBounds'] {
  const minTime = input.minTime ?? null;
  const maxTime = input.maxTime ?? null;
  const now = input.now ?? Math.floor(Date.now() / 1000);

  if (minTime !== null && maxTime !== null && minTime > maxTime) {
    throw new RangeError('minTime must not be after maxTime');
  }

  const notYetActive = minTime !== null && now < minTime;
  const expired = maxTime !== null && now > maxTime;

  return { minTime, maxTime, notYetActive, expired, invalid: notYetActive || expired };
}
