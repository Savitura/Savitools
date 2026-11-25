import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { BadRequestException } from '@nestjs/common';
import * as StellarSdk from '@stellar/stellar-sdk';
import { SorobanService } from './soroban.service';
import {
  EstimateExpirationDto,
  ExtendTtlEstimateDto,
  StorageType,
} from './dto/estimate-expiration.dto';

jest.mock('@stellar/stellar-sdk', () => {
  const actual = jest.requireActual('@stellar/stellar-sdk');
  return {
    ...actual,
    rpc: {
      ...actual.rpc,
      Server: jest.fn(),
    },
  };
});

describe('SorobanService', () => {
  let service: SorobanService;
  let configService: jest.Mocked<ConfigService>;

  beforeEach(async () => {
    configService = {
      get: jest.fn((key: string, defaultValue?: string) => {
        if (key === 'STELLAR_HORIZON_URL') return 'https://horizon-testnet.stellar.org';
        if (key === 'STELLAR_HORIZON_MAINNET_URL') return 'https://horizon.stellar.org';
        if (key === 'STELLAR_RPC_URL') return 'https://soroban-testnet.stellar.org';
        if (key === 'STELLAR_RPC_PUBLIC_URL') return 'https://mainnet.sorobanrpc.com';
        return defaultValue;
      }),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SorobanService,
        {
          provide: ConfigService,
          useValue: configService,
        },
      ],
    }).compile();

    service = module.get<SorobanService>(SorobanService);
  });

  describe('estimateExpiration', () => {
    it('should calculate expiration correctly for healthy entry', () => {
      const dto: EstimateExpirationDto = {
        currentLedger: 1000000,
        liveUntilLedger: 2000000, // 1M ledgers remaining = ~57 days
        storageType: StorageType.PERSISTENT,
        ledgerCloseTime: 5,
      };

      const result = service.estimateExpiration(dto);

      expect(result.ttlRemaining).toBe(1000000);
      expect(result.isExpired).toBe(false);
      expect(result.status).toBe('healthy');
      expect(result.expiresIn.ledgers).toBe(1000000);
      expect(result.expiresIn.seconds).toBe(5000000); // 1M * 5 seconds
      expect(result.expiresIn.days).toBeCloseTo(57.87, 1); // ~58 days
    });

    it('should mark entry as expired when TTL is zero', () => {
      const dto: EstimateExpirationDto = {
        currentLedger: 1000000,
        liveUntilLedger: 1000000, // No TTL remaining
        storageType: StorageType.PERSISTENT,
      };

      const result = service.estimateExpiration(dto);

      expect(result.ttlRemaining).toBe(0);
      expect(result.isExpired).toBe(true);
      expect(result.status).toBe('expired');
      expect(result.recommendation).toContain('archived');
    });

    it('should mark entry as expired when current ledger exceeds liveUntilLedger', () => {
      const dto: EstimateExpirationDto = {
        currentLedger: 1000000,
        liveUntilLedger: 999000, // Already expired
        storageType: StorageType.PERSISTENT,
      };

      const result = service.estimateExpiration(dto);

      expect(result.ttlRemaining).toBe(0);
      expect(result.isExpired).toBe(true);
      expect(result.status).toBe('expired');
    });

    it('should mark entry as critical when < 7 days remaining', () => {
      const ledgersPerDay = 86400 / 5; // 17,280 ledgers per day
      const sixDaysInLedgers = Math.floor(ledgersPerDay * 6);

      const dto: EstimateExpirationDto = {
        currentLedger: 1000000,
        liveUntilLedger: 1000000 + sixDaysInLedgers,
        storageType: StorageType.PERSISTENT,
      };

      const result = service.estimateExpiration(dto);

      expect(result.status).toBe('critical');
      expect(result.recommendation).toContain('URGENT');
      expect(result.expiresIn.days).toBeLessThan(7);
    });

    it('should mark entry as warning when < 30 days remaining', () => {
      const ledgersPerDay = 86400 / 5;
      const twentyDaysInLedgers = Math.floor(ledgersPerDay * 20);

      const dto: EstimateExpirationDto = {
        currentLedger: 1000000,
        liveUntilLedger: 1000000 + twentyDaysInLedgers,
        storageType: StorageType.PERSISTENT,
      };

      const result = service.estimateExpiration(dto);

      expect(result.status).toBe('warning');
      expect(result.expiresIn.days).toBeLessThan(30);
      expect(result.expiresIn.days).toBeGreaterThan(7);
    });

    it('should provide correct recommendation for temporary storage expiration', () => {
      const dto: EstimateExpirationDto = {
        currentLedger: 1000000,
        liveUntilLedger: 1000000, // Expired
        storageType: StorageType.TEMPORARY,
      };

      const result = service.estimateExpiration(dto);

      expect(result.recommendation).toContain('permanently deleted');
      expect(result.recommendation).toContain('cannot be recovered');
    });

    it('should handle custom ledger close time', () => {
      const dto: EstimateExpirationDto = {
        currentLedger: 1000000,
        liveUntilLedger: 1100000, // 100k ledgers
        ledgerCloseTime: 6, // Custom 6 seconds per ledger
      };

      const result = service.estimateExpiration(dto);

      expect(result.expiresIn.seconds).toBe(600000); // 100k * 6
      expect(result.expiresIn.days).toBeCloseTo(6.94, 1);
    });

    it('should throw error for negative ledger numbers', () => {
      const dto: EstimateExpirationDto = {
        currentLedger: -1,
        liveUntilLedger: 1000000,
      };

      expect(() => service.estimateExpiration(dto)).toThrow(BadRequestException);
    });

    it('should calculate estimatedExpirationDate correctly', () => {
      const now = Date.now();
      const dto: EstimateExpirationDto = {
        currentLedger: 1000000,
        liveUntilLedger: 1001000, // 1000 ledgers = 5000 seconds
      };

      const result = service.estimateExpiration(dto);

      const expectedDate = new Date(now + 5000 * 1000);
      const dateDiff = Math.abs(result.estimatedExpirationDate.getTime() - expectedDate.getTime());

      // Allow 1 second tolerance for test execution time
      expect(dateDiff).toBeLessThan(1000);
    });
  });

  describe('estimateTtlExtension', () => {
    it('should calculate TTL extension correctly', () => {
      const dto: ExtendTtlEstimateDto = {
        currentTtl: 100000,
        extendByLedgers: 200000,
        entrySizeBytes: 1024,
        storageType: StorageType.PERSISTENT,
      };

      const result = service.estimateTtlExtension(dto);

      expect(result.newTtl).toBe(300000);
      expect(result.extendedLifetime.ledgers).toBe(200000);
      expect(result.extendedLifetime.days).toBeGreaterThan(0);
      expect(result.estimatedCost.stroops).toBeGreaterThan(0);
      expect(result.estimatedCost.xlm).toBeDefined();
    });

    it('should calculate extended lifetime in days', () => {
      const ledgersPerDay = 86400 / 5; // 17,280 ledgers per day
      const thirtyDaysInLedgers = Math.floor(ledgersPerDay * 30);

      const dto: ExtendTtlEstimateDto = {
        currentTtl: 50000,
        extendByLedgers: thirtyDaysInLedgers,
      };

      const result = service.estimateTtlExtension(dto);

      expect(result.extendedLifetime.days).toBeCloseTo(30, 0);
    });

    it('should provide newLiveUntilLedger when currentLedger is provided', () => {
      const dto: ExtendTtlEstimateDto = {
        currentTtl: 100000,
        extendByLedgers: 50000,
      };

      const result = service.estimateTtlExtension(dto, 1000000);

      expect(result.newLiveUntilLedger).toBe(1150000); // 1000000 + 150000
    });

    it('should estimate lower cost for temporary storage', () => {
      const persistentDto: ExtendTtlEstimateDto = {
        currentTtl: 50000,
        extendByLedgers: 100000,
        entrySizeBytes: 1024,
        storageType: StorageType.PERSISTENT,
      };

      const temporaryDto: ExtendTtlEstimateDto = {
        ...persistentDto,
        storageType: StorageType.TEMPORARY,
      };

      const persistentResult = service.estimateTtlExtension(persistentDto);
      const temporaryResult = service.estimateTtlExtension(temporaryDto);

      expect(temporaryResult.estimatedCost.stroops).toBeLessThan(
        persistentResult.estimatedCost.stroops,
      );
    });

    it('should warn about short-term extensions', () => {
      const dto: ExtendTtlEstimateDto = {
        currentTtl: 10000,
        extendByLedgers: 10000, // ~5.8 days
      };

      const result = service.estimateTtlExtension(dto);

      expect(result.recommendation).toContain('short-term');
      expect(result.recommendation).toContain('90+ days');
    });

    it('should warn about extending temporary storage for long periods', () => {
      const ledgersPerYear = (86400 / 5) * 365;

      const dto: ExtendTtlEstimateDto = {
        currentTtl: 10000,
        extendByLedgers: ledgersPerYear,
        storageType: StorageType.TEMPORARY,
      };

      const result = service.estimateTtlExtension(dto);

      expect(result.recommendation).toContain('WARNING');
      expect(result.recommendation).toContain('persistent storage');
    });

    it('should recommend long-term extension for persistent storage', () => {
      const ledgersPerYear = (86400 / 5) * 365;

      const dto: ExtendTtlEstimateDto = {
        currentTtl: 10000,
        extendByLedgers: ledgersPerYear,
        storageType: StorageType.PERSISTENT,
      };

      const result = service.estimateTtlExtension(dto);

      expect(result.recommendation).toContain('long-term protection');
      expect(result.recommendation).toContain('recommended');
    });

    it('should throw error for invalid TTL values', () => {
      const dto: ExtendTtlEstimateDto = {
        currentTtl: -1,
        extendByLedgers: 100000,
      };

      expect(() => service.estimateTtlExtension(dto)).toThrow(BadRequestException);
    });

    it('should throw error for zero extension', () => {
      const dto: ExtendTtlEstimateDto = {
        currentTtl: 100000,
        extendByLedgers: 0,
      };

      expect(() => service.estimateTtlExtension(dto)).toThrow(BadRequestException);
    });

    it('should format XLM cost correctly', () => {
      const dto: ExtendTtlEstimateDto = {
        currentTtl: 50000,
        extendByLedgers: 100000,
        entrySizeBytes: 2048,
      };

      const result = service.estimateTtlExtension(dto);

      // XLM should be formatted to 7 decimal places
      expect(result.estimatedCost.xlm).toMatch(/^\d+\.\d{7}$/);

      // Should be convertible back to stroops
      const xlmAsNumber = parseFloat(result.estimatedCost.xlm);
      const stroopsFromXlm = Math.round(xlmAsNumber * 10_000_000);
      expect(stroopsFromXlm).toBeCloseTo(result.estimatedCost.stroops, -3);
    });
  });

  describe('edge cases', () => {
    it('should handle very large TTL values', () => {
      const dto: EstimateExpirationDto = {
        currentLedger: 1000000,
        liveUntilLedger: 10000000, // 9 million ledgers
      };

      const result = service.estimateExpiration(dto);

      expect(result.ttlRemaining).toBe(9000000);
      expect(result.status).toBe('healthy');
      expect(result.expiresIn.days).toBeGreaterThan(500);
    });

    it('should handle instance storage type', () => {
      const dto: EstimateExpirationDto = {
        currentLedger: 1000000,
        liveUntilLedger: 1005000,
        storageType: StorageType.INSTANCE,
      };

      const result = service.estimateExpiration(dto);

      expect(result.storageType).toBe(StorageType.INSTANCE);
      expect(result.ttlRemaining).toBe(5000);
    });

    it('should handle zero entry size in cost estimation', () => {
      const dto: ExtendTtlEstimateDto = {
        currentTtl: 10000,
        extendByLedgers: 50000,
        entrySizeBytes: 0,
      };

      // Should not throw, just return minimal cost
      const result = service.estimateTtlExtension(dto);
      expect(result.estimatedCost.stroops).toBeGreaterThanOrEqual(0);
    });
  });

  describe('getContractTtl & estimateBulkExpiration', () => {
    const validContractId = 'CBQHNAXSI55GX2GN6D67GK7BHVPSLJUGZQEU7WJ5LKR5PNUCGLIMAO4K';
    const secondContractId = StellarSdk.StrKey.encodeContract(Buffer.alloc(32, 7));
    const wasmHash = Buffer.alloc(32, 0xab);
    const ledgersPerDay = 86400 / 5; // 17,280

    let mockRpcServer: {
      getLatestLedger: jest.Mock;
      getLedgerEntries: jest.Mock;
    };

    function createContractInstanceEntry(liveUntilLedgerSeq: number) {
      const executable = StellarSdk.xdr.ContractExecutable.contractExecutableWasm(wasmHash);
      const instance = new StellarSdk.xdr.ScContractInstance({
        executable,
        storage: null,
      });
      const val = StellarSdk.xdr.LedgerEntryData.contractData(
        new StellarSdk.xdr.ContractDataEntry({
          ext: new (StellarSdk.xdr.ExtensionPoint as any)(0),
          contract: StellarSdk.Address.fromString(validContractId).toScAddress(),
          key: StellarSdk.xdr.ScVal.scvLedgerKeyContractInstance(),
          durability: StellarSdk.xdr.ContractDataDurability.persistent(),
          val: StellarSdk.xdr.ScVal.scvContractInstance(instance),
        }),
      );

      return {
        liveUntilLedgerSeq,
        lastModifiedLedgerSeq: 900,
        val,
      };
    }

    function createWasmCodeEntry(liveUntilLedgerSeq: number) {
      return {
        liveUntilLedgerSeq,
        lastModifiedLedgerSeq: 900,
        val: StellarSdk.xdr.LedgerEntryData.contractCode(
          new StellarSdk.xdr.ContractCodeEntry({
            ext: new (StellarSdk.xdr.ContractCodeEntryExt as any)(0),
            hash: wasmHash,
            code: Buffer.from([0x00, 0x61, 0x73, 0x6d]),
          }),
        ),
      };
    }

    beforeEach(() => {
      mockRpcServer = {
        getLatestLedger: jest.fn(),
        getLedgerEntries: jest.fn(),
      };
      (StellarSdk.rpc.Server as jest.Mock).mockReset();
      (StellarSdk.rpc.Server as jest.Mock).mockImplementation(() => mockRpcServer);
    });

    it('should return healthy status and accurate TTL for active contract', async () => {
      const currentLedger = 1_000_000;
      const instanceTtlLedgers = Math.floor(ledgersPerDay * 45) + Math.floor((ledgersPerDay / 24) * 12);
      const wasmTtlLedgers = Math.floor(ledgersPerDay * 60);

      mockRpcServer.getLatestLedger.mockResolvedValue({ sequence: currentLedger });
      mockRpcServer.getLedgerEntries
        .mockResolvedValueOnce({
          entries: [createContractInstanceEntry(currentLedger + instanceTtlLedgers)],
        })
        .mockResolvedValueOnce({
          entries: [createWasmCodeEntry(currentLedger + wasmTtlLedgers)],
        });

      const results = await service.estimateBulkExpiration({
        contractAddresses: [validContractId],
        network: 'testnet',
      });

      expect(StellarSdk.rpc.Server).toHaveBeenCalledWith(
        'https://soroban-testnet.stellar.org',
        { allowHttp: false },
      );

      // Verify exact LedgerKey construction for instance and WASM code
      expect(mockRpcServer.getLedgerEntries).toHaveBeenCalledTimes(2);
      const requestedInstanceKey = mockRpcServer.getLedgerEntries.mock.calls[0][0] as StellarSdk.xdr.LedgerKey;
      expect(requestedInstanceKey.switch()).toBe(StellarSdk.xdr.LedgerEntryType.contractData());
      expect(requestedInstanceKey.contractData().key().switch()).toBe(
        StellarSdk.xdr.ScValType.scvLedgerKeyContractInstance(),
      );
      expect(requestedInstanceKey.contractData().durability()).toBe(
        StellarSdk.xdr.ContractDataDurability.persistent(),
      );

      const requestedWasmKey = mockRpcServer.getLedgerEntries.mock.calls[1][0] as StellarSdk.xdr.LedgerKey;
      expect(requestedWasmKey.switch()).toBe(StellarSdk.xdr.LedgerEntryType.contractCode());
      expect(Buffer.from(requestedWasmKey.contractCode().hash())).toEqual(wasmHash);

      expect(results).toEqual([
        {
          contractAddress: validContractId,
          instanceTtl: instanceTtlLedgers,
          wasmTtl: wasmTtlLedgers,
          expiresIn: { days: 45, hours: 12 },
          status: 'healthy',
        },
      ]);
    });

    it('should return warning status when contract TTL is within warning threshold', async () => {
      const currentLedger = 1_000_000;
      const instanceTtlLedgers = Math.floor(ledgersPerDay * 50);
      const wasmTtlLedgers = Math.floor(ledgersPerDay * 15); // 15 days <= 30 days warning, > 7 days critical

      mockRpcServer.getLatestLedger.mockResolvedValue({ sequence: currentLedger });
      mockRpcServer.getLedgerEntries
        .mockResolvedValueOnce({
          entries: [createContractInstanceEntry(currentLedger + instanceTtlLedgers)],
        })
        .mockResolvedValueOnce({
          entries: [createWasmCodeEntry(currentLedger + wasmTtlLedgers)],
        });

      const results = await service.estimateBulkExpiration({
        contractAddresses: [validContractId],
        network: 'mainnet',
      });

      expect(StellarSdk.rpc.Server).toHaveBeenCalledWith(
        'https://mainnet.sorobanrpc.com',
        { allowHttp: false },
      );

      expect(results).toEqual([
        {
          contractAddress: validContractId,
          instanceTtl: instanceTtlLedgers,
          wasmTtl: wasmTtlLedgers,
          expiresIn: { days: 15, hours: 0 },
          status: 'warning',
        },
      ]);
    });

    it('should return expired status when contract TTL has expired', async () => {
      const currentLedger = 1_000_000;

      mockRpcServer.getLatestLedger.mockResolvedValue({ sequence: currentLedger });
      mockRpcServer.getLedgerEntries
        .mockResolvedValueOnce({
          entries: [createContractInstanceEntry(currentLedger - 100)],
        })
        .mockResolvedValueOnce({
          entries: [createWasmCodeEntry(currentLedger + 500_000)],
        });

      const results = await service.estimateBulkExpiration({
        contractAddresses: [validContractId],
        network: 'testnet',
      });

      expect(results).toEqual([
        {
          contractAddress: validContractId,
          instanceTtl: 0,
          wasmTtl: 500_000,
          expiresIn: null,
          status: 'expired',
        },
      ]);
    });

    it('should not report healthy when contract instance entry is missing', async () => {
      const currentLedger = 1_000_000;

      mockRpcServer.getLatestLedger.mockResolvedValue({ sequence: currentLedger });
      mockRpcServer.getLedgerEntries.mockResolvedValueOnce({ entries: [] });

      const results = await service.estimateBulkExpiration({
        contractAddresses: [validContractId],
        network: 'testnet',
      });

      expect(results).toEqual([
        {
          contractAddress: validContractId,
          instanceTtl: null,
          wasmTtl: null,
          expiresIn: null,
          status: 'expired',
        },
      ]);
      expect(results[0].status).not.toBe('healthy');
    });

    it('should not report healthy when WASM code entry is missing', async () => {
      const currentLedger = 1_000_000;
      const instanceTtlLedgers = Math.floor(ledgersPerDay * 45);

      mockRpcServer.getLatestLedger.mockResolvedValue({ sequence: currentLedger });
      mockRpcServer.getLedgerEntries
        .mockResolvedValueOnce({
          entries: [createContractInstanceEntry(currentLedger + instanceTtlLedgers)],
        })
        .mockResolvedValueOnce({ entries: [] });

      const results = await service.estimateBulkExpiration({
        contractAddresses: [validContractId],
        network: 'testnet',
      });

      expect(results).toEqual([
        {
          contractAddress: validContractId,
          instanceTtl: instanceTtlLedgers,
          wasmTtl: null,
          expiresIn: null,
          status: 'expired',
        },
      ]);
      expect(results[0].status).not.toBe('healthy');
    });

    it('should isolate RPC failures per contract in bulk estimation', async () => {
      const currentLedger = 1_000_000;
      const healthyLedgers = Math.floor(ledgersPerDay * 40);

      mockRpcServer.getLatestLedger
        .mockRejectedValueOnce(new Error('RPC timeout'))
        .mockResolvedValueOnce({ sequence: currentLedger });

      mockRpcServer.getLedgerEntries
        .mockResolvedValueOnce({
          entries: [createContractInstanceEntry(currentLedger + healthyLedgers)],
        })
        .mockResolvedValueOnce({
          entries: [createWasmCodeEntry(currentLedger + healthyLedgers)],
        });

      const results = await service.estimateBulkExpiration({
        contractAddresses: [validContractId, secondContractId],
        network: 'testnet',
      });

      expect(results).toEqual([
        {
          contractAddress: validContractId,
          instanceTtl: null,
          wasmTtl: null,
          expiresIn: null,
          status: 'error',
          error: 'RPC timeout',
        },
        {
          contractAddress: secondContractId,
          instanceTtl: healthyLedgers,
          wasmTtl: healthyLedgers,
          expiresIn: { days: 40, hours: 0 },
          status: 'healthy',
        },
      ]);
    });
  });
});
