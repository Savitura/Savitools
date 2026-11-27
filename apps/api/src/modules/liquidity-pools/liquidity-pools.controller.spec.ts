import { Test, TestingModule } from '@nestjs/testing';
import { LiquidityPoolsController } from './liquidity-pools.controller';
import { LiquidityPoolsService } from './liquidity-pools.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

describe('LiquidityPoolsController', () => {
  let controller: LiquidityPoolsController;
  let service: jest.Mocked<LiquidityPoolsService>;

  const mockService = {
    searchPools: jest.fn(),
    getPoolDetails: jest.fn(),
    calculateShareValue: jest.fn(),
    watchPool: jest.fn(),
    unwatchPool: jest.fn(),
    getWatchedPools: jest.fn(),
  };

  const mockReq = { user: { id: 'user-123' } } as any;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [LiquidityPoolsController],
      providers: [{ provide: LiquidityPoolsService, useValue: mockService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<LiquidityPoolsController>(LiquidityPoolsController);
    service = module.get(LiquidityPoolsService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('searchPools', () => {
    it('delegates to service with the DTO and returns its result', async () => {
      const dto = { assetA: 'XLM', assetB: 'USDC:GA5Z', network: 'testnet' } as any;
      const result = [{ poolId: 'abc' }];
      service.searchPools.mockResolvedValue(result as any);

      await expect(controller.searchPools(dto)).resolves.toEqual(result);
      expect(service.searchPools).toHaveBeenCalledWith(dto);
    });

    it('propagates service errors', async () => {
      service.searchPools.mockRejectedValue(new Error('Invalid asset format'));

      await expect(controller.searchPools({} as any)).rejects.toThrow('Invalid asset format');
    });
  });

  describe('getPoolDetails', () => {
    it('passes poolId and network to service', async () => {
      const poolId = 'a'.repeat(64);
      const details = { poolId, reserves: {} };
      service.getPoolDetails.mockResolvedValue(details as any);

      await expect(controller.getPoolDetails(poolId, 'mainnet')).resolves.toEqual(details);
      expect(service.getPoolDetails).toHaveBeenCalledWith(poolId, 'mainnet');
    });

    it('defaults network to testnet', async () => {
      const poolId = 'b'.repeat(64);
      service.getPoolDetails.mockResolvedValue({} as any);

      await controller.getPoolDetails(poolId);
      expect(service.getPoolDetails).toHaveBeenCalledWith(poolId, 'testnet');
    });

    it('propagates not-found errors from service', async () => {
      service.getPoolDetails.mockRejectedValue(new Error('Pool not found'));

      await expect(controller.getPoolDetails('c'.repeat(64))).rejects.toThrow('Pool not found');
    });
  });

  describe('calculateShareValue', () => {
    it('delegates DTO to service and returns result', async () => {
      const dto = { poolId: 'd'.repeat(64), shares: '100', network: 'testnet' } as any;
      const value = { assetA: '10', assetB: '20', ownershipPercent: '0.5' };
      service.calculateShareValue.mockResolvedValue(value as any);

      await expect(controller.calculateShareValue(dto)).resolves.toEqual(value);
      expect(service.calculateShareValue).toHaveBeenCalledWith(dto);
    });

    it('propagates invalid pool state errors', async () => {
      service.calculateShareValue.mockRejectedValue(new Error('Pool has no reserves'));

      await expect(controller.calculateShareValue({} as any)).rejects.toThrow('Pool has no reserves');
    });
  });

  describe('watchPool', () => {
    it('passes authenticated user id and DTO to service', async () => {
      const dto = { poolId: 'e'.repeat(64) } as any;
      const watched = { id: 'w1' };
      service.watchPool.mockResolvedValue(watched as any);

      await expect(controller.watchPool(mockReq, dto)).resolves.toEqual(watched);
      expect(service.watchPool).toHaveBeenCalledWith('user-123', dto);
    });

    it('propagates error when pool does not exist', async () => {
      service.watchPool.mockRejectedValue(new Error('Pool does not exist'));

      await expect(controller.watchPool(mockReq, {} as any)).rejects.toThrow('Pool does not exist');
    });
  });

  describe('unwatchPool', () => {
    it('calls service with user id and watched entry id, returns nothing', async () => {
      service.unwatchPool.mockResolvedValue(undefined);

      await expect(controller.unwatchPool(mockReq, { id: 'w1' } as any)).resolves.toBeUndefined();
      expect(service.unwatchPool).toHaveBeenCalledWith('user-123', 'w1');
    });

    it('propagates not-found errors from service', async () => {
      service.unwatchPool.mockRejectedValue(new Error('Watched pool not found'));

      await expect(controller.unwatchPool(mockReq, { id: 'missing' } as any)).rejects.toThrow(
        'Watched pool not found',
      );
    });
  });

  describe('getWatchedPools', () => {
    it('returns watched pools for the authenticated user', async () => {
      const pools = [{ poolId: 'f'.repeat(64) }];
      service.getWatchedPools.mockResolvedValue(pools as any);

      await expect(controller.getWatchedPools(mockReq)).resolves.toEqual(pools);
      expect(service.getWatchedPools).toHaveBeenCalledWith('user-123');
    });
  });
});
