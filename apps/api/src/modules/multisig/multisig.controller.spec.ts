/**
 * multisig.controller.spec.ts — Savitura/Savitools#352.
 *
 * The controller is pure delegation, so this pins the delegation and the two
 * statuses a client branches on.
 */
import { BadRequestException } from '@nestjs/common';

import { MultisigController } from './multisig.controller';
import { MultisigService } from './multisig.service';
import { MultisigSimulateDto } from './dto/simulate-multisig.dto';

const A = 'GA5ZSEJYB37JRC5AVCIA5MOP4RHT3VM35KCEIWI6VH5XY4O2Y5JV3CJQ';
const B = 'GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H';

const LIMITS = {
  maxSigners: 21,
  maxSignerWeight: 255,
  maxThreshold: 255,
  operationThresholds: [{ kind: 'low' as const, gates: 'Trustline and offer operations' }],
};

const RESULT = {
  threshold: 2,
  signedWeight: 1,
  totalWeight: 2,
  satisfied: false,
  canSubmit: false,
  minimumSignersNeeded: [B],
  risks: [],
};

function buildController(service: Partial<MultisigService>) {
  return new MultisigController(service as MultisigService);
}

function dto(overrides: Partial<MultisigSimulateDto> = {}): MultisigSimulateDto {
  return {
    threshold: 2,
    signers: [
      { key: A, weight: 1, signed: true },
      { key: B, weight: 1, signed: false },
    ],
    ...overrides,
  };
}

describe('MultisigController.getLimits', () => {
  it('returns the service limits verbatim', () => {
    const service = { getLimits: jest.fn().mockReturnValue(LIMITS) };

    expect(buildController(service).getLimits()).toBe(LIMITS);
    expect(service.getLimits).toHaveBeenCalledWith();
  });
});

describe('MultisigController.simulate', () => {
  it('delegates the DTO verbatim and returns the service result', async () => {
    const service = { simulate: jest.fn().mockReturnValue(RESULT) };
    const controller = buildController(service);
    const body = dto({ lowThreshold: 1, highThreshold: 3 });

    const result = await controller.simulate(body);

    expect(service.simulate).toHaveBeenCalledWith(body);
    expect(result).toBe(RESULT);
  });

  it('adds no defaults, so the service owns the threshold defaults', async () => {
    const service = { simulate: jest.fn().mockReturnValue(RESULT) };
    const controller = buildController(service);
    const body = dto();
    delete body.lowThreshold;
    delete body.highThreshold;
    delete body.minTime;
    delete body.maxTime;

    await controller.simulate(body);

    const forwarded = service.simulate.mock.calls[0][0] as MultisigSimulateDto;
    expect('lowThreshold' in forwarded).toBe(false);
    expect('highThreshold' in forwarded).toBe(false);
    expect('minTime' in forwarded).toBe(false);
    expect('maxTime' in forwarded).toBe(false);
  });

  it('propagates a BadRequestException from the service unchanged', () => {
    const service = {
      simulate: jest
        .fn()
        .mockImplementation(() => {
          throw new BadRequestException('threshold must be an integer between 0 and 255');
        }),
    };
    const controller = buildController(service);

    // The handler is synchronous, so the rejection surfaces as a throw rather
    // than as a rejected promise.
    expect(() => controller.simulate(dto({ threshold: 999 }))).toThrow(BadRequestException);
    expect(() => controller.simulate(dto({ threshold: 999 }))).toThrow(
      'threshold must be an integer between 0 and 255',
    );
  });

  describe('the check itself', () => {
    it('bites: a controller that dropped the signers would answer for the wrong account', async () => {
      const service = { simulate: jest.fn().mockReturnValue(RESULT) };
      const controller = buildController(service);

      await controller.simulate(dto());

      const forwarded = service.simulate.mock.calls[0][0] as MultisigSimulateDto;
      expect(forwarded.signers).toHaveLength(2);
      expect(forwarded.signers[0].key).toBe(A);
    });
  });
});
