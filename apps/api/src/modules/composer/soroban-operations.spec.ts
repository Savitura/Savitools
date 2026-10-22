import { Test, TestingModule } from '@nestjs/testing';
import { ComposerService } from './composer.service';
import { ContractsService } from '../contracts/contracts.service';
import { BadRequestException } from '@nestjs/common';
import {
  Account,
  Address,
  Keypair,
  Networks,
  Operation,
  TransactionBuilder,
} from '@stellar/stellar-sdk';

describe('ComposerService - Soroban Operations', () => {
  let service: ComposerService;
  let contractsService: Partial<ContractsService>;

  beforeEach(async () => {
    contractsService = {
      getAbi: jest.fn(),
      encodeAbiArguments: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ComposerService,
        {
          provide: ContractsService,
          useValue: contractsService,
        },
      ],
    }).compile();

    service = module.get<ComposerService>(ComposerService);
  });

  describe('buildInvokeHostFunctionOperation', () => {
    it('should create invoke_host_function operation with valid contract ID', () => {
      const dto = {
        type: 'invoke_host_function',
        contractId: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFCT4',
        functionName: 'transfer',
        arguments: [],
        useAbi: false,
      };

      // The builder returns a raw xdr.Operation; decode it the way the SDK
      // does for a parsed transaction before asserting on its fields.
      const operation = Operation.fromXDRObject(
        (service as any).buildInvokeHostFunctionOperation(dto),
      ) as Operation.InvokeHostFunction;

      expect(operation.type).toBe('invokeHostFunction');
      const invocation = operation.func.invokeContract();
      expect(Address.fromScAddress(invocation.contractAddress()).toString()).toBe(dto.contractId);
      expect(invocation.functionName().toString()).toBe(dto.functionName);
      expect(invocation.args()).toEqual([]);
    });

    it('should throw error for invalid contract ID', () => {
      const dto = {
        type: 'invoke_host_function',
        contractId: 'invalid-contract-id',
        functionName: 'transfer',
        arguments: [],
      };

      expect(() => {
        (service as any).buildInvokeHostFunctionOperation(dto);
      }).toThrow(BadRequestException);
    });

    it('should throw error for missing function name', () => {
      const dto = {
        type: 'invoke_host_function',
        contractId: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFCT4',
        functionName: '',
        arguments: [],
      };

      expect(() => {
        (service as any).buildInvokeHostFunctionOperation(dto);
      }).toThrow(BadRequestException);
    });
  });

  describe('buildScValFromType', () => {
    it('should convert address type correctly', () => {
      const address = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';
      const result = (service as any).buildScValFromType('Address', address);

      expect(result).toBeDefined();
      // The result should be an ScVal representing an address
    });

    it('should convert boolean type correctly', () => {
      const result = (service as any).buildScValFromType('Bool', true);

      expect(result).toBeDefined();
    });

    it('should convert string type correctly', () => {
      const result = (service as any).buildScValFromType('String', 'test');

      expect(result).toBeDefined();
    });

    it('should convert u64 type correctly', () => {
      const result = (service as any).buildScValFromType('U64', '12345');

      expect(result).toBeDefined();
    });

    it('should convert array type correctly', () => {
      const arrayValue = [
        { type: 'String', value: 'test1' },
        { type: 'String', value: 'test2' },
      ];
      const result = (service as any).buildScValFromType('Vec', arrayValue);

      expect(result).toBeDefined();
    });

    it('should throw error for invalid address', () => {
      expect(() => {
        (service as any).buildScValFromType('Address', 'invalid-address');
      }).toThrow(BadRequestException);
    });
  });

  describe('validateSorobanArguments', () => {
    it('should validate arguments with ABI when available', async () => {
      const mockEncodedArgs = [
        {
          name: 'from',
          type: 'Address',
          xdrBase64: 'base64-encoded-xdr',
          decoded: { type: 'Address', value: 'GAAA...' },
        },
      ];

      (contractsService.encodeAbiArguments as jest.Mock).mockResolvedValue(mockEncodedArgs);

      const result = await service.validateSorobanArguments(
        'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFCT4',
        'transfer',
        ['GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF'],
      );

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.encodedArgs).toEqual(mockEncodedArgs);
    });

    it('should return valid result when ABI validation fails', async () => {
      (contractsService.encodeAbiArguments as jest.Mock).mockRejectedValue(
        new Error('ABI not found'),
      );

      const result = await service.validateSorobanArguments(
        'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFCT4',
        'transfer',
        ['test-arg'],
      );

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('ABI not found');
    });
  });

  describe('simulateTransaction with a Soroban operation', () => {
    it('accepts an invoke_host_function transaction', async () => {
      const source = Keypair.random();
      const op = (service as any).buildInvokeHostFunctionOperation({
        type: 'invoke_host_function',
        contractId: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFCT4',
        functionName: 'transfer',
        arguments: [],
        useAbi: false,
      });
      const tx = new TransactionBuilder(new Account(source.publicKey(), '1'), {
        fee: '100',
        networkPassphrase: Networks.TESTNET,
      })
        .addOperation(op)
        .setTimeout(30)
        .build();

      const result = await service.simulateTransaction({
        xdr: tx.toXDR(),
        network: 'testnet',
      } as any);

      expect(result.success).toBe(true);
      expect(result.hash).toBe(tx.hash().toString('hex'));
    });
  });

  describe('getContractAbi', () => {
    it('should return ABI when available', async () => {
      const mockAbi = {
        id: 'test-contract:default',
        contractId: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFCT4',
        methods: [],
        events: [],
      };

      (contractsService.getAbi as jest.Mock).mockReturnValue(mockAbi);

      const result = await service.getContractAbi(
        'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFCT4',
      );

      expect(result).toEqual(mockAbi);
    });

    it('should return null when ABI not found', async () => {
      const error = new Error('Not found');
      (error as any).status = 404;
      (contractsService.getAbi as jest.Mock).mockImplementation(() => {
        throw error;
      });

      const result = await service.getContractAbi(
        'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFCT4',
      );

      expect(result).toBeNull();
    });

    it('should throw error when contracts service unavailable', async () => {
      const serviceWithoutContracts = new ComposerService(undefined);

      await expect(
        serviceWithoutContracts.getContractAbi(
          'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFCT4',
        ),
      ).rejects.toThrow('Contract ABI functionality is not available');
    });
  });

  describe('OPERATION_MANIFEST', () => {
    it('should include invoke_host_function in operation manifest', () => {
      const operations = service.getOperations();
      const invokeOperation = operations.find((op) => op.type === 'invoke_host_function');

      expect(invokeOperation).toBeDefined();
      expect(invokeOperation?.label).toBe('Invoke Host Function');
      expect(invokeOperation?.soroban?.requiresResourceFee).toBe(true);
      expect(invokeOperation?.soroban?.requiresSimulation).toBe(true);
    });

    it('should have correct fields for invoke_host_function', () => {
      const operations = service.getOperations();
      const invokeOperation = operations.find((op) => op.type === 'invoke_host_function');

      expect(invokeOperation?.fields).toEqual([
        {
          name: 'contractId',
          label: 'Contract ID',
          type: 'text',
          required: true,
          placeholder: 'C...',
        },
        {
          name: 'functionName',
          label: 'Function Name',
          type: 'text',
          required: true,
          placeholder: 'transfer',
        },
        {
          name: 'arguments',
          label: 'Arguments',
          type: 'scval-array',
          required: false,
          placeholder: '[]',
        },
        {
          name: 'useAbi',
          label: 'Use ABI Validation',
          type: 'boolean',
          required: false,
          placeholder: 'true',
        },
        {
          name: 'rawMode',
          label: 'Raw Arguments Mode',
          type: 'boolean',
          required: false,
          placeholder: 'false',
        },
      ]);
    });
  });
});
