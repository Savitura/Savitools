import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { BadRequestException, ForbiddenException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { ContractsService } from './contracts.service';
import { Keypair, StrKey } from '@stellar/stellar-sdk';
import * as crypto from 'crypto';

describe('ContractsService', () => {
  let service: ContractsService;
  let configService: ConfigService;

  const mockSecretKey = Keypair.random().secret();
  const mockRpcUrl = 'https://soroban-testnet.stellar.org';

  const createModule = async (
    stellarNetwork?: string,
    overrides: Record<string, string> = {},
  ) => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContractsService,
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: jest.fn((key: string) => {
              if (key === 'STELLAR_RPC_URL') return mockRpcUrl;
              if (key === 'DEPLOYER_SECRET_KEY') return mockSecretKey;
              throw new Error(`Unexpected key: ${key}`);
            }),
            get: jest.fn((key: string, defaultValue?: string) => {
              if (key === 'STELLAR_NETWORK') return stellarNetwork ?? defaultValue ?? 'testnet';
              if (key in overrides) return overrides[key];
              return defaultValue;
            }),
          },
        },
      ],
    }).compile();

    return {
      service: module.get<ContractsService>(ContractsService),
      configService: module.get<ConfigService>(ConfigService),
    };
  };

  describe('storeUploadedWasm', () => {
    it('stores valid WASM and returns metadata', async () => {
      const { service } = await createModule();
      const buffer = Buffer.from('wasm-content');
      const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');

      const result = await service.storeUploadedWasm({
        wasmBuffer: buffer,
        filename: 'test.wasm',
        checksum: sha256,
        source: 'file',
      });

      expect(result.sha256).toBe(sha256);
      expect(result.filename).toBe('test.wasm');
      expect(result.source).toBe('file');
      expect(result.wasmId).toBeDefined();
      expect(result.contentHash).toBeDefined();
    });

    it('verifies SHA-256 checksum successfully', async () => {
      const { service } = await createModule();
      const buffer = Buffer.from('hello-wasm');
      const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');

      const result = await service.storeUploadedWasm({
        wasmBuffer: buffer,
        filename: 'test.wasm',
        checksum: sha256,
      });

      expect(result.sha256).toBe(sha256);
    });

    it('throws UnprocessableEntityException on mismatched checksum', async () => {
      const { service } = await createModule();
      const buffer = Buffer.from('hello-wasm');
      const wrongSha256 = crypto.createHash('sha256').update(Buffer.from('wrong')).digest('hex');

      await expect(
        service.storeUploadedWasm({
          wasmBuffer: buffer,
          filename: 'test.wasm',
          checksum: wrongSha256,
        }),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('deduplicates uploads with the same content hash', async () => {
      const { service } = await createModule();
      const buffer = Buffer.from('duplicate-wasm');

      const res1 = await service.storeUploadedWasm({
        wasmBuffer: buffer,
        filename: 'test1.wasm',
      });

      const res2 = await service.storeUploadedWasm({
        wasmBuffer: buffer,
        filename: 'test2.wasm',
      });

      expect(res1.wasmId).toBe(res2.wasmId);
      expect(res1.contentHash).toBe(res2.contentHash);
    });

    it('rejects oversize files', async () => {
      const { service } = await createModule();
      (service as any).maxFileSize = 10; // 10 bytes limit
      const buffer = Buffer.alloc(20, 0);

      await expect(
        service.storeUploadedWasm({
          wasmBuffer: buffer,
          filename: 'large.wasm',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getInfo', () => {
    it('throws BadRequestException for invalid contract ID', async () => {
      const { service } = await createModule();
      await expect(service.getInfo('invalid-id')).rejects.toThrow(BadRequestException);
    });

    it('returns the configured network from ConfigService for testnet', async () => {
      const { service, configService } = await createModule('testnet');
      const validContractId = StrKey.encodeContract(Buffer.alloc(32));

      jest.spyOn((service as any).rpcServer, 'getContractWasmByContractId').mockResolvedValue(Buffer.from('wasm-data'));

      const result = await service.getInfo(validContractId);

      expect(result.contractId).toBe(validContractId);
      expect(result.network).toBe('testnet');
      expect(configService.get).toHaveBeenCalledWith('STELLAR_NETWORK', 'testnet');
    });

    it('returns the configured network from ConfigService for mainnet', async () => {
      const { service, configService } = await createModule('mainnet');
      const validContractId = StrKey.encodeContract(Buffer.alloc(32));

      jest.spyOn((service as any).rpcServer, 'getContractWasmByContractId').mockResolvedValue(Buffer.from('wasm-data'));

      const result = await service.getInfo(validContractId);

      expect(result.contractId).toBe(validContractId);
      expect(result.network).toBe('mainnet');
      expect(configService.get).toHaveBeenCalledWith('STELLAR_NETWORK', 'testnet');
    });

    it('throws NotFoundException if contract is not found on network', async () => {
      const { service } = await createModule();
      const validContractId = StrKey.encodeContract(Buffer.alloc(32));

      jest.spyOn((service as any).rpcServer, 'getContractWasmByContractId').mockRejectedValue(new Error('404'));

      await expect(service.getInfo(validContractId)).rejects.toThrow(NotFoundException);
    });
  });

  describe('invoke', () => {
    const validContractId = StrKey.encodeContract(Buffer.alloc(32));

    it('throws ForbiddenException when no invocation allowlist is configured', async () => {
      const { service } = await createModule();
      await expect(service.invoke(validContractId, 'transfer', [])).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('throws ForbiddenException when the contract is not allowlisted', async () => {
      const { service } = await createModule(undefined, {
        CONTRACT_INVOKE_ALLOWED_CONTRACTS: 'CDIFFERENT',
        CONTRACT_INVOKE_ALLOWED_FUNCTIONS: 'transfer',
      });
      await expect(service.invoke(validContractId, 'transfer', [])).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('throws ForbiddenException when the function is not allowlisted', async () => {
      const { service } = await createModule(undefined, {
        CONTRACT_INVOKE_ALLOWED_CONTRACTS: validContractId,
        CONTRACT_INVOKE_ALLOWED_FUNCTIONS: 'mint',
      });
      await expect(service.invoke(validContractId, 'transfer', [])).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('throws BadRequestException for an invalid contract ID before checking the allowlist', async () => {
      const { service } = await createModule();
      await expect(service.invoke('invalid-id', 'transfer', [])).rejects.toThrow(
        BadRequestException,
      );
    });

    it('proceeds to the network call when contract and function are both allowlisted', async () => {
      const { service } = await createModule(undefined, {
        CONTRACT_INVOKE_ALLOWED_CONTRACTS: validContractId,
        CONTRACT_INVOKE_ALLOWED_FUNCTIONS: 'transfer',
      });

      jest.spyOn((service as any).rpcServer, 'getAccount').mockRejectedValue(new Error('network unreachable'));

      await expect(service.invoke(validContractId, 'transfer', [])).rejects.toThrow(
        'network unreachable',
      );
    });
  });
});
