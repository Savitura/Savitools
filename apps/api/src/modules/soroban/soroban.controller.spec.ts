import { BadRequestException } from '@nestjs/common';
import { SorobanController } from './soroban.controller';
import { SorobanService } from './soroban.service';

describe('SorobanController', () => {
  const service = {
    estimateExpiration: jest.fn(), estimateTtlExtension: jest.fn(), estimateBulkExpiration: jest.fn(),
  };
  const controller = new SorobanController(service as unknown as SorobanService);
  beforeEach(() => jest.clearAllMocks());

  it('returns an expiration estimate for the supplied ledger values', async () => {
    const dto = { currentLedger: 100, liveUntilLedger: 200 };
    const result = { remainingLedgers: 100 };
    service.estimateExpiration.mockResolvedValue(result);
    await expect(controller.estimateExpiration(dto as never)).resolves.toBe(result);
    expect(service.estimateExpiration).toHaveBeenCalledWith(dto);
  });

  it('returns extension and bulk estimates', async () => {
    const extension = { extendTo: 500 };
    const bulk = { contracts: ['C1'] };
    service.estimateTtlExtension.mockResolvedValue(extension);
    service.estimateBulkExpiration.mockResolvedValue(bulk);
    await expect(controller.estimateTtlExtension(extension as never)).resolves.toBe(extension);
    await expect(controller.bulkEstimate(bulk as never)).resolves.toBe(bulk);
    expect(service.estimateTtlExtension).toHaveBeenCalledWith(extension);
    expect(service.estimateBulkExpiration).toHaveBeenCalledWith(bulk);
  });

  it('propagates invalid TTL input', async () => {
    service.estimateExpiration.mockRejectedValue(new BadRequestException('Invalid ledger'));
    await expect(controller.estimateExpiration({ currentLedger: -1 } as never)).rejects.toThrow(BadRequestException);
  });
});
