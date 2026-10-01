/**
 * multisig-weights.ts — the weighted-quorum arithmetic behind
 * Savitura/Savitools#352.
 *
 * These assertions pin the two properties a caller stakes a signature on: the
 * pass/fail decision is made on integers and never on a rounded percentage, and
 * `minimumSignersNeeded` is genuinely minimal rather than "whatever a greedy
 * pass happened to find".
 */
import {
  MAX_SIGNER_WEIGHT,
  MAX_SIGNERS,
  MultisigSignerInput,
  simulateMultisig,
  solveMinimumSigners,
} from './multisig-weights';

const A = 'GA5ZSEJYB37JRC5AVCIA5MOP4RHT3VM35KCEIWI6VH5XY4O2Y5JV3CJQ';
const B = 'GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H';
const C = 'GC3C4AKRBQLHOJ45U4XG35ESVWRDECWO5XLDGYADO6CRPR2L5KJP7LW';
const D = 'GDY6XN6HXK5HGFHEZ3GIRZL2SPKOKNBTCX2Q4YQ5W4GQVQZ5K7XYZAB';

function signer(key: string, weight: number, signed = false, required = false): MultisigSignerInput {
  return { key, weight, signed, required };
}

/** A conventional 2-of-3, the configuration most multisigs actually use. */
const TWO_OF_THREE = { threshold: 2, signers: [signer(A, 1), signer(B, 1), signer(C, 1)] };

describe('simulateMultisig — totals and authorisation', () => {
  it('authorises an operation exactly at the threshold, not below it', () => {
    expect(simulateMultisig({ ...TWO_OF_THREE, signers: [signer(A, 1, true), signer(B, 1)] }).satisfied).toBe(
      false,
    );
    expect(
      simulateMultisig({ ...TWO_OF_THREE, signers: [signer(A, 1, true), signer(B, 1, true)] })
        .satisfied,
    ).toBe(true);
  });

  it('sums the collected weight and reports the deficit and the surplus', () => {
    const result = simulateMultisig({
      ...TWO_OF_THREE,
      signers: [signer(A, 2, true), signer(B, 1, true), signer(C, 1)],
    });

    expect(result.totalWeight).toBe(4);
    expect(result.signedWeight).toBe(3);
    expect(result.deficit).toBe(0);
    expect(result.surplus).toBe(1);
    expect(result.progressPercent).toBe(100);
  });

  it('reports progress against the threshold and caps it at 100', () => {
    expect(
      simulateMultisig({ ...TWO_OF_THREE, signers: [signer(A, 1, true), signer(B, 1)] })
        .progressPercent,
    ).toBe(50);
    expect(
      simulateMultisig({ ...TWO_OF_THREE, signers: [signer(A, 1, true), signer(B, 1, true)] })
        .progressPercent,
    ).toBe(100);
  });

  it('treats a threshold of zero as already satisfied', () => {
    const result = simulateMultisig({ threshold: 0, signers: [signer(A, 1)] });

    expect(result.satisfied).toBe(true);
    expect(result.progressPercent).toBe(100);
    expect(result.risks.map((risk) => risk.code)).toContain('THRESHOLD_ZERO');
  });

  it('counts a master key carrying the account threshold as its own weight', () => {
    const result = simulateMultisig({ threshold: 10, signers: [signer(A, 10, true)] });

    expect(result.satisfied).toBe(true);
    expect(result.minimumSignersNeeded).toEqual([]);
  });
});

describe('simulateMultisig — the three weight classes', () => {
  it('defaults low and high to the medium threshold, as Stellar does', () => {
    const result = simulateMultisig({ ...TWO_OF_THREE, signers: [signer(A, 1, true), signer(B, 1)] });

    expect(result.lowThreshold).toBe(2);
    expect(result.mediumThreshold).toBe(2);
    expect(result.highThreshold).toBe(2);
  });

  it('clears each class independently, so a low-only quorum stays locked out of payments', () => {
    const result = simulateMultisig({
      threshold: 2,
      lowThreshold: 1,
      highThreshold: 3,
      signers: [signer(A, 1, true), signer(B, 1)],
    });

    expect(
      result.operationThresholds.map((entry) => [entry.kind, entry.cleared, entry.deficit]),
    ).toEqual([
      ['low', true, 0],
      ['medium', false, 1],
      ['high', false, 2],
    ]);
  });
});

describe('simulateMultisig — required signers', () => {
  it('blocks submission while a required signer is outstanding, however much weight is in', () => {
    const result = simulateMultisig({
      threshold: 1,
      signers: [signer(A, 5, true), signer(B, 0, false, true)],
    });

    expect(result.satisfied).toBe(true);
    expect(result.canSubmit).toBe(false);
    expect(result.outstandingRequiredSigners).toEqual([B]);
    expect(result.risks.map((risk) => risk.code)).toContain('REQUIRED_SIGNER_UNSIGNED');
  });

  it('allows submission once the required signer has signed', () => {
    const result = simulateMultisig({
      threshold: 1,
      signers: [signer(A, 5, true), signer(B, 0, true, true)],
    });

    expect(result.canSubmit).toBe(true);
    expect(result.outstandingRequiredSigners).toEqual([]);
  });

  it('keeps a required signer out of the zero-weight finding, since weight 0 is its definition', () => {
    const result = simulateMultisig({
      threshold: 1,
      signers: [signer(A, 0), signer(B, 0, false, true)],
    });

    expect(result.risks.find((risk) => risk.code === 'ZERO_WEIGHT_SIGNERS')?.signers).toEqual([
      A,
    ]);
  });

  it('rejects a required signer that also carries weight', () => {
    expect(() =>
      simulateMultisig({ threshold: 1, signers: [signer(A, 1, false, true)] }),
    ).toThrow(/is required and must have weight 0/);
  });
});

describe('simulateMultisig — per-signer standing', () => {
  it('shares total and threshold weight as percentages', () => {
    const [, second] = simulateMultisig({
      threshold: 4,
      signers: [signer(A, 1), signer(B, 3), signer(C, 4)],
    }).signers;

    expect(second.shareOfTotalPercent).toBe(37.5);
    expect(second.shareOfThresholdPercent).toBe(75);
  });

  it('flags the signer who alone reaches the threshold', () => {
    const result = simulateMultisig({
      threshold: 3,
      signers: [signer(A, 3), signer(B, 1), signer(C, 1)],
    });

    expect(result.signers[0].controlsAccount).toBe(true);
    expect(result.signers[1].controlsAccount).toBe(false);
    expect(result.risks.find((risk) => risk.code === 'SINGLE_SIGNER_CONTROLS')?.signers).toEqual([
      A,
    ]);
  });

  it('calls a signer indispensable when removing it drops the account below the threshold', () => {
    const result = simulateMultisig(TWO_OF_THREE);

    // 3 signers at weight 1 each: dropping any one leaves 2, which still meets
    // a threshold of 2, so every signer is redundant.
    expect(result.signers.every((entry) => entry.redundant)).toBe(true);
    expect(result.signers.every((entry) => !entry.indispensable)).toBe(true);
  });

  it('calls every signer indispensable when all of them are needed', () => {
    const result = simulateMultisig({ threshold: 3, signers: [signer(A, 1), signer(B, 1), signer(C, 1)] });

    expect(result.signers.every((entry) => entry.indispensable)).toBe(true);
    expect(result.signers.every((entry) => !entry.redundant)).toBe(true);
    expect(result.risks.map((risk) => risk.code)).toContain('REQUIRES_EVERY_SIGNER');
  });
});

describe('solveMinimumSigners', () => {
  it('is minimal by count', () => {
    // No single signer reaches 100 (the largest is 60), and 60 + 40 does, so two
    // is the floor no combination of one can beat.
    const signers = [
      signer(A, 60),
      signer(B, 40),
      signer(C, 35),
      signer(D, 30),
    ];

    const result = solveMinimumSigners(signers, 100);

    expect(result).toHaveLength(2);
    expect(result).toEqual([A, B]);
  });

  it('finds a combination that no single signer reaches', () => {
    // 9 and 8 both fall short of 10, so only the pair reaches it.
    expect(solveMinimumSigners([signer(A, 9), signer(B, 8)], 10)).toEqual([A, B]);
  });

  it('breaks a tie on the tightest fit, which a descending greedy pass does not', () => {
    // 60 + 45 = 105 and 60 + 40 = 100 both reach a deficit of 100 with two
    // signers. A descending pass answers 60 + 45; asking a signer to commit
    // weight the quorum does not need is the thing this avoids.
    expect(solveMinimumSigners([signer(A, 60), signer(B, 45), signer(C, 40)], 100)).toEqual([
      A, C,
    ]);
    // With 45 raised to 50, three pairs clear the deficit — 60+45 = 105,
    // 60+50 = 110 and 45+50 = 95 does not — so 105 is still the tightest and the
    // answer is unchanged.
    expect(solveMinimumSigners([signer(A, 60), signer(B, 45), signer(C, 50)], 100)).toEqual([
      A, B,
    ]);
  });

  it('prefers one signer over two when either would clear the deficit', () => {
    expect(solveMinimumSigners([signer(A, 50), signer(B, 50), signer(C, 100)], 100)).toEqual([
      C,
    ]);
  });

  it('ignores zero-weight signers, which can never help reach the threshold', () => {
    expect(solveMinimumSigners([signer(A, 0), signer(B, 5), signer(C, 5)], 5)).toEqual([B]);
  });

  it('returns null when the available weight cannot cover the deficit', () => {
    expect(solveMinimumSigners([signer(A, 1), signer(B, 1)], 5)).toBeNull();
  });

  it('returns an empty set when nothing more is needed', () => {
    expect(solveMinimumSigners([signer(A, 5)], 0)).toEqual([]);
  });

  it('handles the full SEP-0023 signer count without falling over', () => {
    const signers = Array.from({ length: MAX_SIGNERS }, (_, index) =>
      signer(`G${'A'.repeat(54)}${index}`, MAX_SIGNER_WEIGHT),
    );

    const result = solveMinimumSigners(signers, MAX_SIGNER_WEIGHT);

    expect(result).toHaveLength(1);
  });
});

describe('simulateMultisig — minimum set and risks', () => {
  it('names the smallest set of outstanding signers that closes the quorum', () => {
    const result = simulateMultisig({
      threshold: 10,
      signers: [signer(A, 5), signer(B, 5, true), signer(C, 4), signer(D, 1)],
    });

    expect(result.satisfied).toBe(false);
    expect(result.deficit).toBe(5);
    expect(result.minimumSignersNeeded).toEqual([A]);
    expect(result.minimumSetWeight).toBe(5);
  });

  it('reports null when even every outstanding signer falls short', () => {
    const result = simulateMultisig({ threshold: 10, signers: [signer(A, 3), signer(B, 3)] });

    expect(result.minimumSignersNeeded).toBeNull();
    expect(result.risks.map((risk) => risk.code)).toContain('THRESHOLD_ABOVE_TOTAL_WEIGHT');
  });

  it('warns that one outstanding signature is all that stands between here and submission', () => {
    const result = simulateMultisig({ threshold: 3, signers: [signer(A, 2), signer(B, 3)] });

    // A's weight of 2 does not reach the threshold on its own; B's 3 does.
    expect(result.minimumSignersNeeded).toEqual([B]);
    expect(result.risks.map((risk) => risk.code)).toContain('QUORUM_SINGLE_POINT_OF_FAILURE');
  });

  it('flags a threshold no set of signatures can ever reach', () => {
    const result = simulateMultisig({ threshold: 5, signers: [signer(A, 1), signer(B, 1)] });

    expect(
      result.risks.find((risk) => risk.code === 'THRESHOLD_ABOVE_TOTAL_WEIGHT')?.severity,
    ).toBe('critical');
    expect(result.canSubmit).toBe(false);
  });

  it('flags a signer that could be dropped without breaking the quorum', () => {
    const result = simulateMultisig({
      threshold: 2,
      signers: [signer(A, 2), signer(B, 1), signer(C, 1)],
    });

    // Any one of the three can go: the remaining weight of 2 or 3 still meets
    // the threshold, which is the risk a 2-of-3 configured with extra signers
    // is quietly carrying.
    expect(result.risks.find((risk) => risk.code === 'REDUNDANT_SIGNER')?.signers).toEqual([
      A,
      B,
      C,
    ]);
  });

  it('flags a repeated key, because Stellar would count it once', () => {
    const result = simulateMultisig({ threshold: 2, signers: [signer(A, 1), signer(A, 1), signer(B, 1)] });

    expect(result.duplicateSigners).toEqual([A]);
    expect(result.risks.map((risk) => risk.code)).toContain('DUPLICATE_SIGNER');
  });

  it('orders the risks worst-first', () => {
    const result = simulateMultisig({
      threshold: 10,
      signers: [signer(A, 1, false, false), signer(B, 0), signer(C, 0)],
    });

    const severities = result.risks.map((risk) => risk.severity);
    expect(severities).toEqual([...severities].sort(bySeverity));
    expect(result.risks[0].code).toBe('THRESHOLD_ABOVE_TOTAL_WEIGHT');
  });
});

function bySeverity(a: string, b: string): number {
  const order: Record<string, number> = { critical: 0, warning: 1, info: 2 };
  return order[a] - order[b];
}

describe('simulateMultisig — transaction time bounds', () => {
  const NOW = 1_800_000_000;

  it('treats an absent window as unbounded', () => {
    const result = simulateMultisig({ ...TWO_OF_THREE, now: NOW });

    expect(result.timeBounds).toEqual({
      minTime: null,
      maxTime: null,
      notYetActive: false,
      expired: false,
      invalid: false,
    });
  });

  it('flags a window that has not opened yet', () => {
    const result = simulateMultisig({
      ...TWO_OF_THREE,
      minTime: NOW + 60,
      now: NOW,
    });

    expect(result.timeBounds.notYetActive).toBe(true);
    expect(result.timeBounds.invalid).toBe(true);
  });

  it('flags a window that has already closed', () => {
    const result = simulateMultisig({ ...TWO_OF_THREE, maxTime: NOW - 60, now: NOW });

    expect(result.timeBounds.expired).toBe(true);
    expect(result.timeBounds.invalid).toBe(true);
  });

  it('rejects a window that closes before it opens', () => {
    expect(() =>
      simulateMultisig({ ...TWO_OF_THREE, minTime: NOW + 60, maxTime: NOW, now: NOW }),
    ).toThrow(/minTime must not be after maxTime/);
  });
});

describe('simulateMultisig — rejected configurations', () => {
  it('rejects a threshold or a weight outside the uint8 the XDR uses', () => {
    expect(() => simulateMultisig({ threshold: 256, signers: [signer(A, 1)] })).toThrow(
      RangeError,
    );
    expect(() => simulateMultisig({ threshold: 1, signers: [signer(A, 256)] })).toThrow(
      RangeError,
    );
    expect(() => simulateMultisig({ threshold: 1, signers: [signer(A, -1)] })).toThrow(
      RangeError,
    );
  });

  it('rejects a fractional weight, which the XDR cannot hold', () => {
    expect(() => simulateMultisig({ threshold: 1, signers: [signer(A, 1.5)] })).toThrow(
      RangeError,
    );
  });

  it('rejects a signer list longer than SEP-0023 allows', () => {
    const signers = Array.from({ length: MAX_SIGNERS + 1 }, (_, index) =>
      signer(`G${'A'.repeat(54)}${index}`, 1),
    );

    expect(() => simulateMultisig({ threshold: 1, signers })).toThrow(
      /at most 21 entries/,
    );
  });

  it('rejects low and high thresholds outside the same range', () => {
    expect(() =>
      simulateMultisig({ threshold: 1, lowThreshold: -1, signers: [signer(A, 1)] }),
    ).toThrow(RangeError);
    expect(() =>
      simulateMultisig({ threshold: 1, highThreshold: 999, signers: [signer(A, 1)] }),
    ).toThrow(RangeError);
  });

  describe('the check itself', () => {
    it('bites: a threshold compared with ">=" instead of a per-signer sum would wrongly pass', () => {
      // Weight is not a count of signers: one signer of weight 2 meets a
      // threshold of 2 on its own, while two signers of weight 1 also do, but
      // one signer of weight 1 against a threshold of 2 does not.
      const alone = simulateMultisig({ threshold: 2, signers: [signer(A, 2, true)] });
      const pair = simulateMultisig({
        threshold: 2,
        signers: [signer(A, 1, true), signer(B, 1, true)],
      });
      const short = simulateMultisig({
        threshold: 2,
        signers: [signer(A, 1, true), signer(B, 1)],
      });

      expect(alone.satisfied).toBe(true);
      expect(pair.satisfied).toBe(true);
      expect(short.satisfied).toBe(false);
    });
  });
});
