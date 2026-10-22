/**
 * multisig.service.ts — Savitura/Savitools#352.
 *
 * The arithmetic is pinned in `multisig-weights.spec.ts`. What matters here is
 * the translation layer: the DTO speaks strings and optional booleans, the
 * arithmetic speaks integers, and a rejected configuration has to arrive as a
 * 400 rather than a 500.
 */
import { BadRequestException } from '@nestjs/common';

import { MAX_SIGNER_WEIGHT, MAX_SIGNERS } from './multisig-weights';
import { MultisigService } from './multisig.service';
import { MultisigSimulateDto, MultisigSignerDto } from './dto/simulate-multisig.dto';

const A = 'GA5ZSEJYB37JRC5AVCIA5MOP4RHT3VM35KCEIWI6VH5XY4O2Y5JV3CJQ';
const B = 'GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H';
const C = 'GC3C4AKRBQLHOJ45U4XG35ESVWRDECWO5XLDGYADO6CRPR2L5KJP7LW';

function signer(key: string, weight: number, signed = false): MultisigSignerDto {
  return { key, weight, signed };
}

function dto(overrides: Partial<MultisigSimulateDto> = {}): MultisigSimulateDto {
  return {
    threshold: 2,
    signers: [signer(A, 1, true), signer(B, 1), signer(C, 1)],
    ...overrides,
  };
}

describe('MultisigService.getLimits', () => {
  const service = new MultisigService();

  it('publishes the bounds the DTO enforces, so a client can check first', () => {
    const limits = service.getLimits();

    expect(limits.maxSigners).toBe(MAX_SIGNERS);
    expect(limits.maxSignerWeight).toBe(MAX_SIGNER_WEIGHT);
    expect(limits.maxThreshold).toBe(MAX_SIGNER_WEIGHT);
  });

  it('describes every weight class the simulator evaluates', () => {
    expect(service.getLimits().operationThresholds.map((entry) => entry.kind)).toEqual([
      'low',
      'medium',
      'high',
    ]);
    expect(
      service.getLimits().operationThresholds.every((entry) => entry.gates.length > 0),
    ).toBe(true);
  });

  it('is JSON-serialisable, so the client can cache the caps', () => {
    expect(JSON.parse(JSON.stringify(service.getLimits())).maxSigners).toBe(MAX_SIGNERS);
  });
});

describe('MultisigService.simulate', () => {
  const service = new MultisigService();

  it('evaluates a 2-of-3 with one signature collected', () => {
    const result = service.simulate(dto());

    expect(result.threshold).toBe(2);
    expect(result.totalWeight).toBe(3);
    expect(result.signedWeight).toBe(1);
    expect(result.satisfied).toBe(false);
    expect(result.minimumSignersNeeded).toHaveLength(1);
    expect(result.canSubmit).toBe(false);
  });

  it('defaults signed and required to false rather than leaving them undefined', () => {
    const result = service.simulate({
      threshold: 2,
      signers: [{ key: A, weight: 1 }, { key: B, weight: 1 }],
    });

    expect(result.signers.every((entry) => entry.signed === false)).toBe(true);
    expect(result.signers.every((entry) => entry.required === false)).toBe(true);
  });

  it('leaves low and high to the arithmetic when the caller omits them', () => {
    const result = service.simulate(dto());

    expect(result.lowThreshold).toBe(2);
    expect(result.highThreshold).toBe(2);
  });

  it('passes distinct low and high thresholds through', () => {
    const result = service.simulate(dto({ lowThreshold: 1, highThreshold: 3 }));

    expect(result.operationThresholds.map((entry) => entry.cleared)).toEqual([
      true,
      false,
      false,
    ]);
  });
});

describe('MultisigService.simulate — time bounds', () => {
  const service = new MultisigService();

  it('accepts unix seconds, matching what Horizon reports', () => {
    // The service reads the wall clock, so the window is expressed relative to
    // it rather than against a pinned instant.
    const now = Math.floor(Date.now() / 1000);
    const result = service.simulate(
      dto({ minTime: String(now - 3600), maxTime: String(now + 3600) }),
    );

    expect(result.timeBounds).toEqual({
      minTime: now - 3600,
      maxTime: now + 3600,
      notYetActive: false,
      expired: false,
      invalid: false,
    });
  });

  it('reports a window that has already closed against the wall clock', () => {
    const now = Math.floor(Date.now() / 1000);
    const result = service.simulate(dto({ maxTime: String(now - 3600) }));

    expect(result.timeBounds.expired).toBe(true);
    expect(result.timeBounds.invalid).toBe(true);
  });

  it('accepts an ISO 8601 instant, matching what an operator reads', () => {
    const result = service.simulate(dto({ maxTime: '2027-01-17T08:00:00Z' }));

    expect(result.timeBounds.maxTime).toBe(Date.parse('2027-01-17T08:00:00Z') / 1000);
    expect(Number.isInteger(result.timeBounds.maxTime)).toBe(true);
  });

  it('treats an absent or blank bound as unbounded', () => {
    expect(service.simulate(dto()).timeBounds.maxTime).toBeNull();
    expect(service.simulate(dto({ minTime: '' })).timeBounds.minTime).toBeNull();
  });

  it('rejects a timestamp it cannot read with a message naming the field', () => {
    expect(() => service.simulate(dto({ minTime: 'next tuesday' }))).toThrow(
      BadRequestException,
    );
    expect(() => service.simulate(dto({ maxTime: 'tomorrow' }))).toThrow(
      /maxTime must be unix seconds or an ISO 8601 timestamp/,
    );
  });

  it('rejects a negative unix timestamp', () => {
    // `Date.parse('-5')` is a valid instant in some engines, so the numeric
    // branch has to be anchored on its own before falling through to parsing.
    expect(() => service.simulate(dto({ minTime: '-5' }))).toThrow(
      /minTime must be a non-negative unix timestamp/,
    );
  });

  it('rejects a window that closes before it opens', () => {
    const now = Math.floor(Date.now() / 1000);

    expect(() =>
      service.simulate(dto({ minTime: String(now + 3600), maxTime: String(now) })),
    ).toThrow(/minTime must not be after maxTime/);
  });
});

describe('MultisigService.simulate — rejected configurations become 400s', () => {
  const service = new MultisigService();

  it('translates a threshold the XDR cannot hold rather than letting a RangeError escape', () => {
    expect(() => service.simulate(dto({ threshold: 256, signers: [signer(A, 1)] }))).toThrow(
      BadRequestException,
    );
    expect(() => service.simulate(dto({ threshold: 256, signers: [signer(A, 1)] }))).toThrow(
      /threshold must be an integer between 0 and 255/,
    );
  });

  it('accepts a threshold the weights can never reach, and reports it as a risk', () => {
    // 250 is a legal uint8, so this is a configuration to report on rather than
    // a request to reject: the account is simply unusable as described.
    const result = service.simulate(dto({ threshold: 250, signers: [signer(A, 1)] }));

    expect(result.risks.map((risk) => risk.code)).toContain('THRESHOLD_ABOVE_TOTAL_WEIGHT');
    expect(result.satisfied).toBe(false);
    expect(result.minimumSignersNeeded).toBeNull();
  });

  it('translates a required signer that also carries weight', () => {
    expect(() =>
      service.simulate({
        threshold: 1,
        signers: [{ key: A, weight: 1, required: true }],
      }),
    ).toThrow(/is required and must have weight 0/);
  });

  it('translates a signer list longer than SEP-0023 allows', () => {
    const signers = Array.from({ length: MAX_SIGNERS + 1 }, (_, index) =>
      signer(`G${'A'.repeat(54)}${index}`, 1),
    );

    expect(() => service.simulate({ threshold: 1, signers })).toThrow(/at most 21 entries/);
  });

  it('does not swallow an unexpected failure into a 400', () => {
    const broken = {
      signers: null,
    } as unknown as MultisigSimulateDto;

    // A TypeError from a shape the DTO should have caught must stay a 500 so a
    // genuine bug is not filed as the caller's mistake.
    expect(() => service.simulate(broken)).toThrow(TypeError);
  });
});

describe('MultisigService.simulate — reproducibility', () => {
  const service = new MultisigService();

  it('answers the same request identically, since nothing is fetched or stored', () => {
    const first = service.simulate(dto());
    const second = service.simulate(dto());

    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });

  it('reads no clock when the caller pins no window, so the answer is stable', () => {
    const first = service.simulate(dto());
    const second = service.simulate(dto());

    expect(first.timeBounds).toEqual(second.timeBounds);
    expect(first.satisfied).toBe(second.satisfied);
  });
});
