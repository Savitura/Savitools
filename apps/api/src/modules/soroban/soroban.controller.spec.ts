import { Test, TestingModule } from '@nestjs/testing';
import { SorobanController } from './soroban.controller';
import { SorobanService } from './soroban.service';
import {
  EstimateExpirationDto,
  ExtendTtlEstimateDto,
  BulkEstimateDto,
  StorageType,
} from './dto/estimate-expiration.dto';

describe('SorobanController', () => {
  let controller: SorobanController;
  let sorobanService: jest.Mocked<Partial<SorobanService>>;

  beforeEach(async () => {
    sorobanService = {
      estimateExpiration: jest.fn(),
      estimateTtlExtension: jest.fn(),
      estimateBulkExpiration: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SorobanController],
      providers: [
        {
          provide: SorobanService,
          useValue: sorobanService,
        },
      ],
    }).compile();

    controller = module.get<SorobanController>(SorobanController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('estimateExpiration', () => {
    it('should forward request to SorobanService.estimateExpiration', () => {
      const dto: EstimateExpirationDto = {
        currentLedger: 1000000,
        liveUntilLedger: 1100000,
        storageType: StorageType.PERSISTENT,
        ledgerCloseTime: 5,
      };

      const mockResponse = {
        currentLedger: 1000000,
        liveUntilLedger: 1100000,
        ttlRemaining: 100000,
        storageType: StorageType.PERSISTENT,
        isExpired: false,
        expiresIn: {
          ledgers: 100000,
          seconds: 500000,
          minutes: 8333,
          hours: 138.9,
          days: 5.79,
        },
        estimatedExpirationDate: new Date('2026-11-28T20:13:30.000Z'),
        status: 'critical' as const,
        recommendation: 'URGENT: Entry expires in 5.8 days. Extend TTL.',
      };

      (sorobanService.estimateExpiration as jest.Mock).mockReturnValue(mockResponse);

      const result = controller.estimateExpiration(dto);
      expect(result).toBe(mockResponse);
      expect(sorobanService.estimateExpiration).toHaveBeenCalledWith(dto);
    });
  });

  describe('estimateTtlExtension', () => {
    it('should forward request to SorobanService.estimateTtlExtension', () => {
      const dto: ExtendTtlEstimateDto = {
        currentTtl: 100000,
        extendByLedgers: 200000,
        entrySizeBytes: 1024,
        storageType: StorageType.PERSISTENT,
      };

      const mockResponse = {
        currentTtl: 100000,
        extendByLedgers: 200000,
        newTtl: 300000,
        extendedLifetime: {
          ledgers: 200000,
          days: 11.57,
        },
        estimatedCost: {
          stroops: 210000,
          xlm: '0.0210000',
        },
        recommendation: 'Extension provides a good balance between cost and protection.',
      };

      (sorobanService.estimateTtlExtension as jest.Mock).mockReturnValue(mockResponse);

      const result = controller.estimateTtlExtension(dto);
      expect(result).toBe(mockResponse);
      expect(sorobanService.estimateTtlExtension).toHaveBeenCalledWith(dto);
    });
  });

  describe('bulkEstimate', () => {
    it('should forward request to SorobanService.estimateBulkExpiration', async () => {
      const dto: BulkEstimateDto = {
        contractAddresses: ['CA3D5KRYMCMQU7YOGCVSAEZIC5UFLCCU34H6S376T6CFGD3TUWK7CG7'],
        network: 'testnet',
      };

      const mockResponse = [
        {
          contractAddress: 'CA3D5KRYMCMQU7YOGCVSAEZIC5UFLCCU34H6S376T6CFGD3TUWK7CG7',
          instanceTtl: null,
          wasmTtl: null,
          expiresIn: null,
          status: 'healthy' as const,
        },
      ];

      (sorobanService.estimateBulkExpiration as jest.Mock).mockResolvedValue(mockResponse);

      const result = await controller.bulkEstimate(dto);
      expect(result).toBe(mockResponse);
      expect(sorobanService.estimateBulkExpiration).toHaveBeenCalledWith(dto);
    });
  });
});
