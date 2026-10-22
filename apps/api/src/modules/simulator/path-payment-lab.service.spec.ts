/**
 * path-payment-lab.service.ts — Savitura/Savitools#351.
 *
 * The service owns the one thing the pure arithmetic in `slippage-lab.ts`
 * cannot: deciding which Horizon route to simulate and translating an upstream
 * or arithmetic failure into a 400 rather than a 500. Everything else is
 * checked there, so these cases concentrate on the wiring between the two.
 */
import { BadRequestException } from '@nestjs/common';

import { Direction } from './dto/find-paths.dto';
import { PathPaymentLabDto } from './dto/path-payment-lab.dto';
import { PathPaymentLabService } from './path-payment-lab.service';
import {
  HorizonSimulatedPath,
  SimulatorService,
  StrictReceiveResult,
  StrictSendResult,
} from './simulator.service';

const USDC = 'USDC:GA5ZSEJYB37JRC5AVCIA5MOP4RHT3VM35KCEIWI6VH5XY4O2Y5JV3CJQ';

function hop(code: string): HorizonSimulatedPath['path'][number] {
  return { assetType: 'credit_alphanum4', assetCode: code, assetIssuer: USDC };
}

function route(sourceAmount: string, destinationAmount: string): HorizonSimulatedPath {
  return {
    sourceAmount,
    destinationAmount,
    path: [hop('USDC')],
    pathLength: 1,
    exchangeRate: '1.0',
  };
}

function strictSend(paths: HorizonSimulatedPath[]): StrictSendResult {
  return {
    sourceAsset: 'XLM',
    sourceAmount: '100.0000000',
    destAsset: USDC,
    network: 'testnet',
    mode: 'strict_send',
    totalPathsFound: paths.length,
    paths,
    bestPath: paths[0],
    slippagePercent: '0',
  };
}

function strictReceive(paths: HorizonSimulatedPath[]): StrictReceiveResult {
  return {
    sourceAsset: 'XLM',
    destAsset: USDC,
    destAmount: '100.0000000',
    network: 'testnet',
    mode: 'strict_receive',
    totalPathsFound: paths.length,
    paths,
    bestPath: paths[0],
    sourceAmountNeeded: paths[0].sourceAmount,
    slippagePercent: '0',
  };
}

function buildService(overrides: Partial<SimulatorService> = {}) {
  return new PathPaymentLabService({
    simulateStrictSend: jest.fn().mockResolvedValue(strictSend([route('100', '98')])),
    simulateStrictReceive: jest.fn().mockResolvedValue(strictReceive([route('102', '100')])),
    ...overrides,
  } as unknown as SimulatorService);
}

function dto(overrides: Partial<PathPaymentLabDto> = {}): PathPaymentLabDto {
  return {
    direction: Direction.STRICT_SEND,
    sourceAsset: 'XLM',
    destinationAsset: USDC,
    amount: '100.0000000',
    slippageScenarios: [0.5, 2],
    adverseMovePercent: 1,
    ...overrides,
  };
}

describe('PathPaymentLabService', () => {
  describe('strict send', () => {
    it('prices the tolerances against the destination the route would deliver', async () => {
      const service = buildService();

      const result = await service.run(dto());

      expect(result.direction).toBe('strict_send');
      expect(result.routeCount).toBe(1);
      expect(result.route.variableAmount).toBe('98.0000000');
      expect(result.route.fixedAmount).toBe('100.0000000');
      expect(result.comparison.scenarios.map((s) => s.guarantee)).toEqual([
        '97.5100000',
        '96.0400000',
      ]);
    });

    it('defaults the network to testnet and passes the pair through untouched', async () => {
      const simulator = {
        simulateStrictSend: jest.fn().mockResolvedValue(strictSend([route('100', '98')])),
      } as unknown as SimulatorService;

      await buildService(simulator).run(dto());

      expect(simulator.simulateStrictSend).toHaveBeenCalledWith({
        sourceAsset: 'XLM',
        sourceAmount: '100.0000000',
        destAsset: USDC,
        network: 'testnet',
      });
    });

    it('forwards mainnet when it is asked for', async () => {
      const simulator = {
        simulateStrictSend: jest.fn().mockResolvedValue(strictSend([route('100', '98')])),
      } as unknown as SimulatorService;

      await buildService(simulator).run(dto({ network: 'mainnet' }));

      expect(simulator.simulateStrictSend).toHaveBeenCalledWith(
        expect.objectContaining({ network: 'mainnet' }),
      );
    });

    it('uses the destination of the best route, not of the first one returned', async () => {
      const service = buildService({
        simulateStrictSend: jest
          .fn()
          .mockResolvedValue(strictSend([route('100', '99'), route('100', '90')])),
      } as Partial<SimulatorService>);

      const result = await service.run(dto({ routeIndex: 1 }));

      expect(result.route.index).toBe(1);
      // Route 1 delivers 90 where route 0 delivers 99, so it has to be reported
      // as trailing the best route before any adverse move is even applied.
      expect(result.comparison.routeDispersionPercent).toBe(9.0909);
      expect(result.comparison.scenarios[0].guarantee).toBe('89.5500000');
    });
  });

  describe('strict receive', () => {
    it('caps the source above the quote instead of flooring the destination', async () => {
      const service = buildService();

      const result = await service.run(dto({ direction: Direction.STRICT_RECEIVE }));

      expect(result.direction).toBe('strict_receive');
      expect(result.comparison.guaranteeField).toBe('sendMax');
      expect(result.route.variableAmount).toBe('102.0000000');
      expect(result.route.fixedAmount).toBe('100.0000000');
      expect(result.comparison.scenarios.map((s) => s.guarantee)).toEqual([
        '102.5100000',
        '104.0400000',
      ]);
    });

    it('sends the pinned amount as the destination amount', async () => {
      const simulator = {
        simulateStrictReceive: jest
          .fn()
          .mockResolvedValue(strictReceive([route('102', '100')])),
      } as unknown as SimulatorService;

      await buildService(simulator).run(dto({ direction: Direction.STRICT_RECEIVE }));

      expect(simulator.simulateStrictReceive).toHaveBeenCalledWith({
        sourceAsset: 'XLM',
        destAsset: USDC,
        destAmount: '100.0000000',
        network: 'testnet',
      });
    });

    it('measures the worst route by the source it needs, the way strict receive fills', async () => {
      const service = buildService({
        simulateStrictReceive: jest
          .fn()
          .mockResolvedValue(strictReceive([route('96', '100'), route('112', '100')])),
      } as Partial<SimulatorService>);

      const result = await service.run(
        dto({ direction: Direction.STRICT_RECEIVE, routeIndex: 1 }),
      );

      // Route 1 costs 112 to deliver the same 100 that route 0 delivers for 96,
      // so the dispersion is the 16 the caller would overpay against the best
      // route. Measuring it against the chosen route instead would read 12.5%.
      expect(result.comparison.routeDispersionPercent).toBe(16.6667);
    });
  });

  describe('rejected requests', () => {
    it('reports how many routes exist when routeIndex is out of range', async () => {
      const service = buildService({
        simulateStrictSend: jest
          .fn()
          .mockResolvedValue(strictSend([route('100', '98'), route('100', '97')])),
      } as Partial<SimulatorService>);

      await expect(service.run(dto({ routeIndex: 7 }))).rejects.toThrow(
        /routeIndex 7 is out of range: Horizon returned 2 route\(s\)/,
      );
      await expect(service.run(dto({ routeIndex: 7 }))).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('accepts the last index, so the bound is exclusive not off by one', async () => {
      const service = buildService({
        simulateStrictSend: jest
          .fn()
          .mockResolvedValue(strictSend([route('100', '98'), route('100', '97')])),
      } as Partial<SimulatorService>);

      const result = await service.run(dto({ routeIndex: 1 }));

      expect(result.route.index).toBe(1);
    });

    it('passes a BadRequestException from the route lookup through unchanged', async () => {
      const service = buildService({
        simulateStrictSend: jest
          .fn()
          .mockRejectedValue(new BadRequestException('No path found from XLM to USDC on testnet')),
      } as Partial<SimulatorService>);

      await expect(service.run(dto())).rejects.toThrow('No path found from XLM to USDC on testnet');
    });

    it('turns an unreadable amount into a 400 rather than a 500', async () => {
      const service = buildService({
        simulateStrictSend: jest
          .fn()
          .mockResolvedValue(strictSend([route('not-a-number', '98')])),
      } as Partial<SimulatorService>);

      await expect(service.run(dto())).rejects.toBeInstanceOf(BadRequestException);
      await expect(service.run(dto())).rejects.toThrow(/is not a valid Stellar amount/);
    });

    it('turns an unexpected upstream failure into a 400 that names the cause', async () => {
      const service = buildService({
        simulateStrictSend: jest.fn().mockRejectedValue(new Error('socket hang up')),
      } as Partial<SimulatorService>);

      await expect(service.run(dto())).rejects.toBeInstanceOf(BadRequestException);
      await expect(service.run(dto())).rejects.toThrow(
        'Route lookup failed: socket hang up',
      );
    });

    it('reports a rejection from the strict receive branch the same way', async () => {
      const service = buildService({
        simulateStrictReceive: jest.fn().mockRejectedValue(new Error('ECONNRESET')),
      } as Partial<SimulatorService>);

      await expect(
        service.run(dto({ direction: Direction.STRICT_RECEIVE })),
      ).rejects.toThrow('Route lookup failed: ECONNRESET');
    });

    it('treats an omitted adverse move as no move at all', async () => {
      const result = await buildService().run(dto({ adverseMovePercent: undefined }));

      expect(result.comparison.adverseMovePercent).toBe(0);
      expect(result.comparison.scenarios.every((s) => s.verdict === 'pass')).toBe(true);
    });
  });

  describe('the check itself', () => {
    it('bites: a routeIndex bound that is inclusive would wrongly reject the last route', async () => {
      const service = buildService({
        simulateStrictSend: jest
          .fn()
          .mockResolvedValue(strictSend([route('100', '98'), route('100', '97')])),
      } as Partial<SimulatorService>);

      // Two routes means valid indices 0 and 1 only.
      await expect(service.run(dto({ routeIndex: 2 }))).rejects.toThrow(BadRequestException);
      await expect(service.run(dto({ routeIndex: 1 }))).resolves.toBeDefined();
    });
  });
});
