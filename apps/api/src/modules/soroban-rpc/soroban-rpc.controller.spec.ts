import { BadRequestException } from '@nestjs/common';
import { SorobanRpcController } from './soroban-rpc.controller';
import { SorobanRpcService } from './soroban-rpc.service';

describe('SorobanRpcController', () => {
  const service = { listMethods: jest.fn(), getMethod: jest.fn(), execute: jest.fn() };
  const controller = new SorobanRpcController(service as unknown as SorobanRpcService);
  beforeEach(() => jest.clearAllMocks());

  it('returns the available methods and a named method description', () => {
    const methods = [{ name: 'getLatestLedger' }];
    service.listMethods.mockReturnValue(methods);
    service.getMethod.mockReturnValue(methods[0]);
    expect(controller.listMethods()).toBe(methods);
    expect(controller.getMethod('getLatestLedger')).toBe(methods[0]);
    expect(service.getMethod).toHaveBeenCalledWith('getLatestLedger');
  });

  it('forwards only method, params and network to execution', async () => {
    const result = { sequence: 123 };
    service.execute.mockResolvedValue(result);
    const dto = { method: 'getLatestLedger', params: {}, network: 'testnet' as const };
    await expect(controller.execute(dto)).resolves.toBe(result);
    expect(service.execute).toHaveBeenCalledWith(dto);
  });

  it('propagates validation errors', async () => {
    service.execute.mockRejectedValue(new BadRequestException('Unknown method'));
    await expect(controller.execute({ method: 'bad', params: {}, network: 'testnet' }))
      .rejects.toThrow(BadRequestException);
  });
});
