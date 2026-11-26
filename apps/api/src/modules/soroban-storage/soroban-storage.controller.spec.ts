import { BadRequestException } from '@nestjs/common';
import { SorobanStorageController } from './soroban-storage.controller';
import { SorobanStorageService } from './soroban-storage.service';

describe('SorobanStorageController', () => {
  const service = {
    queryStorage: jest.fn(), compareStorage: jest.fn(),
    createTypedStorageKey: jest.fn(), getDurabilityInfo: jest.fn(),
  };
  const controller = new SorobanStorageController(service as unknown as SorobanStorageService);
  beforeEach(() => jest.clearAllMocks());

  it('returns decoded storage from the query service', async () => {
    const dto = { contractId: 'contract', key: 'AAAA', durability: 'persistent' };
    const decoded = { found: true, entry: { key: { type: 'symbol', value: 'counter' }, value: { type: 'u32', value: 3 } } };
    service.queryStorage.mockResolvedValue(decoded);
    await expect(controller.queryStorage(dto as never)).resolves.toBe(decoded);
    expect(service.queryStorage).toHaveBeenCalledWith(dto);
  });

  it('forwards comparison and typed key creation', async () => {
    const comparison = { ledger1: 1, ledger2: 2 };
    service.compareStorage.mockResolvedValue(comparison);
    await expect(controller.compareStorage(comparison as never)).resolves.toBe(comparison);
    expect(service.compareStorage).toHaveBeenCalledWith(comparison);
    const key = { type: 'symbol', value: 'counter' };
    const encoded = { xdr: 'AAAA', decoded: key };
    service.createTypedStorageKey.mockResolvedValue(encoded);
    await expect(controller.createTypedKey(key as never)).resolves.toBe(encoded);
    expect(service.createTypedStorageKey).toHaveBeenCalledWith(key);
  });

  it('returns durability descriptions and propagates key errors', async () => {
    const info = { persistent: { expiry: 'extendable' } };
    service.getDurabilityInfo.mockReturnValue(info);
    expect(controller.getDurabilityInfo()).toBe(info);
    service.createTypedStorageKey.mockRejectedValue(new BadRequestException('Invalid key'));
    await expect(controller.createTypedKey({ type: 'bad' } as never)).rejects.toThrow(BadRequestException);
  });
});
