/**
 * slippage-lab.ts — exact slippage arithmetic for the path-payment lab
 * (Savitura/Savitools#351).
 *
 * The point of these assertions is that no tolerance is ever reported with
 * float drift, that a tolerance exactly equal to the adverse move is reported
 * as `exact` rather than as a pass or a failure, that rounding never hands back
 * a guarantee the network would reject, and that nothing leaves this module as
 * a `bigint` — `JSON.stringify` throws on those, which would turn every lab run
 * into a 500.
 */
import {
  FULL_SCALE_BPS,
  adverseVariableAmount,
  bpsToPercent,
  compareSlippageScenarios,
  guaranteeAmount,
  parseLabAmount,
  percentToBps,
  roundTo,
  scaleDown,
  scaleUp,
} from './slippage-lab';

const STROOP = 10_000_000n;
const HUNDRED = 100n * STROOP;

describe('percent helpers', () => {
  it('round-trips a percentage through hundredths of a percent', () => {
    expect(percentToBps(0.5)).toBe(50n);
    expect(percentToBps(1)).toBe(100n);
    expect(percentToBps(33.33)).toBe(3333n);
    expect(bpsToPercent(3333n)).toBe(33.33);
  });

  it('rejects a percentage that is not finite and a negative one', () => {
    expect(() => percentToBps(Number.NaN)).toThrow(RangeError);
    expect(() => percentToBps(Number.POSITIVE_INFINITY)).toThrow(RangeError);
    expect(() => percentToBps(-0.01)).toThrow(RangeError);
  });

  it('rounds half away from zero rather than to the even neighbour', () => {
    expect(roundTo(0.125, 2)).toBe(0.13);
    expect(roundTo(-0.125, 2)).toBe(-0.13);
    expect(roundTo(Number.NaN, 2)).toBe(0);
  });
});

describe('scaling', () => {
  it('rounds down going to the destination and up coming from it', () => {
    // 100.0000001 at 99.9% is 99.90000009999, which no amount string can hold.
    const amount = 100n * STROOP + 1n;

    expect(scaleDown(amount, 9_990n)).toBe(999_000_000n);
    expect(scaleUp(amount, 9_990n)).toBe(999_000_001n);
  });

  it('keeps a full, zero and dust scale exact', () => {
    expect(scaleDown(HUNDRED, FULL_SCALE_BPS)).toBe(HUNDRED);
    expect(scaleDown(HUNDRED, 0n)).toBe(0n);
    expect(scaleUp(0n, FULL_SCALE_BPS)).toBe(0n);
    expect(scaleUp(1n, FULL_SCALE_BPS)).toBe(1n);
  });

  it('refuses a negative amount or a negative scale', () => {
    expect(() => scaleDown(-1n, FULL_SCALE_BPS)).toThrow(RangeError);
    expect(() => scaleUp(-1n, FULL_SCALE_BPS)).toThrow(RangeError);
    expect(() => scaleDown(HUNDRED, -1n)).toThrow(RangeError);
    expect(() => scaleUp(HUNDRED, -1n)).toThrow(RangeError);
  });
});

describe('parseLabAmount', () => {
  it('reads a Stellar amount into stroops', () => {
    expect(parseLabAmount('100')).toBe(HUNDRED);
    expect(parseLabAmount('100.0000000')).toBe(HUNDRED);
    expect(parseLabAmount('0.0000001')).toBe(1n);
  });

  it('rejects anything it cannot read rather than silently returning zero', () => {
    expect(() => parseLabAmount('abc')).toThrow(RangeError);
    expect(() => parseLabAmount('')).toThrow(RangeError);
    expect(() => parseLabAmount('-5')).toThrow(RangeError);
    // `BigInt('')` is 0n, so an empty string has to be caught by the shape
    // check before it can masquerade as a zero-amount payment.
    expect(() => parseLabAmount('', 'amount')).toThrow(
      /amount is not a valid Stellar amount/,
    );
  });
});

describe('guaranteeAmount / adverseVariableAmount', () => {
  it('puts the strict-send floor under the quoted destination', () => {
    expect(guaranteeAmount('strict_send', HUNDRED, 100n)).toBe(99n * STROOP);
    expect(adverseVariableAmount('strict_send', HUNDRED, 100n)).toBe(99n * STROOP);
  });

  it('puts the strict-receive cap over the quoted source', () => {
    expect(guaranteeAmount('strict_receive', HUNDRED, 100n)).toBe(101n * STROOP);
    expect(adverseVariableAmount('strict_receive', HUNDRED, 100n)).toBe(101n * STROOP);
  });

  it('degenerates cleanly at a 100% tolerance and a 100% adverse move', () => {
    expect(guaranteeAmount('strict_send', HUNDRED, FULL_SCALE_BPS)).toBe(0n);
    expect(adverseVariableAmount('strict_receive', HUNDRED, FULL_SCALE_BPS)).toBe(
      200n * STROOP,
    );
  });

  it('refuses a tolerance or a move beyond 100%', () => {
    expect(() => guaranteeAmount('strict_send', HUNDRED, 10_001n)).toThrow(RangeError);
    expect(() => adverseVariableAmount('strict_send', HUNDRED, 10_001n)).toThrow(RangeError);
  });
});

describe('compareSlippageScenarios — strict send', () => {
  const strictSend = (
    overrides: Partial<Parameters<typeof compareSlippageScenarios>[0]> = {},
  ) =>
    compareSlippageScenarios({
      direction: 'strict_send',
      fixedAmountStroops: HUNDRED,
      variableAmountStroops: HUNDRED,
      slippageScenarios: [0.1, 0.5, 1, 5],
      adverseMovePercent: 2,
      ...overrides,
    });

  it('prices every tolerance against the quoted destination', () => {
    expect(strictSend().guaranteeField).toBe('destinationMin');
    expect(strictSend().scenarios.map((scenario) => scenario.guarantee)).toEqual([
      '99.9000000',
      '99.5000000',
      '99.0000000',
      '95.0000000',
    ]);
  });

  it('fails every tolerance narrower than the adverse move and passes the wider one', () => {
    // A 2% adverse move delivers 98, so a floor of 99.9 cannot be met.
    expect(strictSend().scenarios.map((scenario) => scenario.verdict)).toEqual([
      'fail',
      'fail',
      'fail',
      'pass',
    ]);
  });

  it('reports the shortfall for a failing tolerance and the buffer for a passing one', () => {
    const all = strictSend().scenarios;
    const tightest = all[0];
    const widest = all[all.length - 1];

    expect(tightest.headroom).toBe('-1.9000000');
    expect(tightest.headroomPercent).toBe(-1.9);
    expect(widest.headroom).toBe('3.0000000');
    expect(widest.headroomPercent).toBe(3);
  });

  it('recommends the narrowest tolerance that still clears the move', () => {
    const result = strictSend();

    expect(result.recommendedSlippagePercent).toBe(5);
    expect(result.recommendedHeadroomPercent).toBe(3);
    expect(result.exceededByEveryScenario).toBe(false);
    expect(result.tightestSlippagePercent).toBe(0.1);
    expect(result.widestSlippagePercent).toBe(5);
  });

  it('reports no recommendation when every compared tolerance is exceeded', () => {
    const result = strictSend({ slippageScenarios: [0.1, 0.5] });

    expect(result.recommendedSlippagePercent).toBeNull();
    expect(result.recommendedHeadroomPercent).toBeNull();
    expect(result.exceededByEveryScenario).toBe(true);
  });

  it('calls a tolerance that exactly equals the move "exact", not a pass', () => {
    const result = strictSend({ adverseMovePercent: 1, slippageScenarios: [1] });

    expect(result.scenarios[0].verdict).toBe('exact');
    expect(result.scenarios[0].headroom).toBe('0.0000000');
    expect(result.scenarios[0].headroomPercent).toBe(0);
    // The guarantee and the worst case landed on the same amount, which is
    // exactly what "no slack left" means.
    expect(result.scenarios[0].guarantee).toBe(result.scenarios[0].adverseAmount);
  });

  it('recommends the tightest tolerance when nothing has moved', () => {
    const result = strictSend({ adverseMovePercent: 0 });

    expect(result.recommendedSlippagePercent).toBe(0.1);
    expect(result.scenarios.every((scenario) => scenario.verdict === 'pass')).toBe(true);
  });

  it('orders the comparison and collapses duplicates, whatever order they arrived in', () => {
    const result = strictSend({ slippageScenarios: [5, 0.5, 0.5, 1] });

    expect(result.scenarios.map((scenario) => scenario.slippagePercent)).toEqual([
      0.5, 1, 5,
    ]);
    expect(result.tightestSlippagePercent).toBe(0.5);
    expect(result.widestSlippagePercent).toBe(5);
  });

  it('measures how far the chosen route already sits below the best route', () => {
    expect(strictSend({ bestVariableAmountStroops: 110n * STROOP }).routeDispersionPercent).toBe(
      9.0909,
    );
    // A chosen route that is at least as good as the reference is not behind.
    expect(strictSend({ bestVariableAmountStroops: HUNDRED }).routeDispersionPercent).toBe(0);
    expect(strictSend().routeDispersionPercent).toBeNull();
  });

  it('serialises to JSON: a bigint in the result would throw on every run', () => {
    const roundTripped = JSON.parse(
      JSON.stringify(strictSend({ bestVariableAmountStroops: 110n * STROOP })),
    );

    expect(roundTripped.scenarios[0].guarantee).toBe('99.9000000');
  });
});

describe('compareSlippageScenarios — strict receive', () => {
  const strictReceive = (
    overrides: Partial<Parameters<typeof compareSlippageScenarios>[0]> = {},
  ) =>
    compareSlippageScenarios({
      direction: 'strict_receive',
      fixedAmountStroops: HUNDRED,
      variableAmountStroops: HUNDRED,
      slippageScenarios: [0.5, 2],
      adverseMovePercent: 1,
      ...overrides,
    });

  it('caps the source above the quote rather than flooring the destination', () => {
    const result = strictReceive();

    expect(result.guaranteeField).toBe('sendMax');
    expect(result.scenarios.map((scenario) => scenario.guarantee)).toEqual([
      '100.5000000',
      '102.0000000',
    ]);
    expect(result.adverseVariableAmount).toBe('101.0000000');
  });

  it('measures headroom as cap minus worst case, so positive still means "clears"', () => {
    const [tooTight, clearing] = strictReceive().scenarios;

    // A 1% adverse move costs 101, which the 100.5 cap does not cover.
    expect(tooTight.verdict).toBe('fail');
    expect(tooTight.headroom).toBe('-0.5000000');
    expect(clearing.verdict).toBe('pass');
    expect(clearing.headroom).toBe('1.0000000');
  });

  it('recommends the first tolerance that covers the move', () => {
    expect(strictReceive().recommendedSlippagePercent).toBe(2);
    expect(
      strictReceive({ slippageScenarios: [0.1, 0.5, 2] }).recommendedSlippagePercent,
    ).toBe(2);
    expect(
      strictReceive({ slippageScenarios: [0.1, 0.5] }).exceededByEveryScenario,
    ).toBe(true);
  });

  it('rounds the send cap up so the guarantee is never below the quoted cost', () => {
    // One stroop of source at 0.01% is 0.0001 stroop, which floors to zero and
    // would promise a payment that costs nothing.
    const result = compareSlippageScenarios({
      direction: 'strict_receive',
      fixedAmountStroops: HUNDRED,
      variableAmountStroops: 1n,
      slippageScenarios: [0.01],
      adverseMovePercent: 0,
    });

    expect(result.scenarios[0].guarantee).toBe('0.0000002');
  });

  it('lets a 0% adverse move clear a tolerance that a 1% move would fail', () => {
    const result = strictReceive({ adverseMovePercent: 0, slippageScenarios: [0.5] });

    expect(result.scenarios[0].verdict).toBe('pass');
    expect(result.scenarios[0].headroom).toBe('0.5000000');
  });

  it('measures dispersion against the cheapest source, not the dearest one', () => {
    // The variable leg is what the payee sends here, so a route costing 112
    // where the best costs 96 is behind by 16 out of 96. Reading "behind" as a
    // plain subtraction would call 112 better than 96 and report zero.
    expect(
      strictReceive({
        variableAmountStroops: 112n * STROOP,
        bestVariableAmountStroops: 96n * STROOP,
      }).routeDispersionPercent,
    ).toBe(16.6667);
    expect(
      strictReceive({
        variableAmountStroops: 90n * STROOP,
        bestVariableAmountStroops: 96n * STROOP,
      }).routeDispersionPercent,
    ).toBe(0);
  });
});

describe('compareSlippageScenarios — rejected input', () => {
  const base = {
    direction: 'strict_send' as const,
    fixedAmountStroops: HUNDRED,
    variableAmountStroops: HUNDRED,
    slippageScenarios: [1],
    adverseMovePercent: 0,
  };

  it('requires at least one tolerance to compare', () => {
    expect(() => compareSlippageScenarios({ ...base, slippageScenarios: [] })).toThrow(
      RangeError,
    );
  });

  it('refuses a tolerance or an adverse move beyond 100%', () => {
    expect(() => compareSlippageScenarios({ ...base, slippageScenarios: [101] })).toThrow(
      RangeError,
    );
    expect(() =>
      compareSlippageScenarios({ ...base, adverseMovePercent: 100.01 }),
    ).toThrow(RangeError);
  });

  it('refuses a tolerance that is not a percentage', () => {
    expect(() =>
      compareSlippageScenarios({ ...base, slippageScenarios: [Number.NaN] }),
    ).toThrow(RangeError);
  });

  it('refuses a negative amount on either leg', () => {
    expect(() =>
      compareSlippageScenarios({ ...base, variableAmountStroops: -1n }),
    ).toThrow(RangeError);
    expect(() => compareSlippageScenarios({ ...base, fixedAmountStroops: -1n })).toThrow(
      RangeError,
    );
  });

  it('handles a zero-amount route without dividing by zero', () => {
    const result = compareSlippageScenarios({ ...base, variableAmountStroops: 0n });

    expect(result.scenarios[0].headroomPercent).toBe(0);
    expect(result.scenarios[0].verdict).toBe('exact');
    expect(result.routeDispersionPercent).toBeNull();
  });

  describe('the check itself', () => {
    it('bites: reversing the headroom sign for strict send flips every verdict', () => {
      // A `destinationMin` is a floor, so the slack is `worstCase − guarantee`.
      // Subtracting the other way would report a 0.1% tolerance against a 2%
      // move as a comfortable pass instead of a failure.
      const worstCase = adverseVariableAmount('strict_send', HUNDRED, 200n);
      const guarantee = guaranteeAmount('strict_send', HUNDRED, 10n);

      expect(worstCase - guarantee).toBe(-19_000_000n);
      expect(guarantee - worstCase).toBe(19_000_000n);
      expect(
        compareSlippageScenarios({ ...base, adverseMovePercent: 2 }).scenarios[0].verdict,
      ).toBe('fail');
    });

    it('bites: bpsToPercent reports hundredths of a percent as a percentage', () => {
      // Reporting basis points as if they were percent would move every
      // tolerance a hundredfold and quietly invalidate every comparison.
      expect(bpsToPercent(3333n)).toBe(33.33);
      expect(bpsToPercent(percentToBps(0.1))).toBe(0.1);
    });
  });
});
