/**
 * path-payment-lab.controller.spec.ts — Savitura/Savitools#351.
 *
 * The controller holds no logic, so this pins the delegation and the status
 * contract: a read-only simulation answers 200 rather than Nest's 201 default.
 */
import { BadRequestException } from '@nestjs/common';

import { SimulatorController } from './simulator.controller';
import { SimulatorService } from './simulator.service';
import { OrderbookService } from './orderbook.service';
import { PoolQuoteService } from './pool-quote.service';
import { PathPaymentLabService } from './path-payment-lab.service';
import { Direction } from './dto/find-paths.dto';
import { PathPaymentLabDto } from './dto/path-payment-lab.dto';
import { MAX_SLIPPAGE_SCENARIOS } from './dto/path-payment-lab.dto';

const RESULT = {
  network: 'testnet',
  direction: 'strict_send',
  sourceAsset: 'XLM',
  destinationAsset: 'USDC:GA5ZSEJYB37JRC5AVCIA5MOP4RHT3VM35KCEIWI6VH5XY4O2Y5JV3CJQ',
  routeCount: 1,
  route: {
    index: 0,
    pathLength: 1,
    sourceAmount: '100.0000000',
    destinationAmount: '98.0000000',
    exchangeRate: '0.98',
    fixedAmount: '100.0000000',
    variableAmount: '98.0000000',
    hops: [],
  },
  comparison: {
    direction: 'strict_send',
    guaranteeField: 'destinationMin',
    scenarios: [],
    exceededByEveryScenario: false,
  },
};

function buildController(lab: Partial<PathPaymentLabService>) {
  return new SimulatorController(
    {} as SimulatorService,
    {} as OrderbookService,
    {} as PoolQuoteService,
    lab as PathPaymentLabService,
  );
}

function dto(overrides: Partial<PathPaymentLabDto> = {}): PathPaymentLabDto {
  return {
    direction: Direction.STRICT_SEND,
    sourceAsset: 'XLM',
    destinationAsset: 'USDC:GA5ZSEJYB37JRC5AVCIA5MOP4RHT3VM35KCEIWI6VH5XY4O2Y5JV3CJQ',
    amount: '100.0000000',
    slippageScenarios: [0.5, 2],
    adverseMovePercent: 1,
    ...overrides,
  };
}

describe('SimulatorController.runPathPaymentLab', () => {
  it('delegates the DTO verbatim and returns the service result', async () => {
    const lab = { run: jest.fn().mockResolvedValue(RESULT) };
    const controller = buildController(lab);
    const body = dto({ routeIndex: 0 });

    const result = await controller.runPathPaymentLab(body);

    expect(lab.run).toHaveBeenCalledWith(body);
    expect(result).toBe(RESULT);
  });

  it('adds no defaults of its own, so the service owns every default', async () => {
    const lab = { run: jest.fn().mockResolvedValue(RESULT) };
    const controller = buildController(lab);
    const body = dto();
    delete body.network;
    delete body.routeIndex;
    delete body.adverseMovePercent;

    await controller.runPathPaymentLab(body);

    const forwarded = lab.run.mock.calls[0][0] as PathPaymentLabDto;
    expect('network' in forwarded).toBe(false);
    expect('routeIndex' in forwarded).toBe(false);
    expect('adverseMovePercent' in forwarded).toBe(false);
    expect(forwarded.slippageScenarios).toEqual([0.5, 2]);
  });

  it('forwards a full comparison table without narrowing the scenarios', async () => {
    const lab = { run: jest.fn().mockResolvedValue(RESULT) };
    const controller = buildController(lab);
    const scenarios = Array.from({ length: MAX_SLIPPAGE_SCENARIOS }, (_, i) => i + 1);

    await controller.runPathPaymentLab(dto({ slippageScenarios: scenarios }));

    expect(lab.run).toHaveBeenCalledWith(
      expect.objectContaining({ slippageScenarios: scenarios }),
    );
  });

  it('propagates a BadRequestException from the service unchanged', async () => {
    const lab = {
      run: jest
        .fn()
        .mockRejectedValue(
          new BadRequestException('No path found from XLM to USDC on testnet'),
        ),
    };
    const controller = buildController(lab);

    await expect(controller.runPathPaymentLab(dto())).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(controller.runPathPaymentLab(dto())).rejects.toThrow(
      'No path found from XLM to USDC on testnet',
    );
  });

  it('propagates an out-of-range route rejection', async () => {
    const lab = {
      run: jest
        .fn()
        .mockRejectedValue(
          new BadRequestException(
            'routeIndex 4 is out of range: Horizon returned 2 route(s) for this pair and amount',
          ),
        ),
    };
    const controller = buildController(lab);

    await expect(controller.runPathPaymentLab(dto({ routeIndex: 4 }))).rejects.toThrow(
      /routeIndex 4 is out of range/,
    );
  });

  describe('the check itself', () => {
    it('bites: the route is read only for the direction that fills the source', async () => {
      const lab = { run: jest.fn().mockResolvedValue(RESULT) };
      const controller = buildController(lab);

      await controller.runPathPaymentLab(dto({ direction: Direction.STRICT_RECEIVE }));

      expect(lab.run).toHaveBeenCalledWith(
        expect.objectContaining({ direction: Direction.STRICT_RECEIVE }),
      );
    });
  });
});
