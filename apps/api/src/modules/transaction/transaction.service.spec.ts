import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { TransactionService } from './transaction.service';
import { TransactionReplay } from './entities/transaction-replay.entity';

describe('TransactionService', () => {
  let service: TransactionService;

  const mockRepository = {
    create: jest.fn().mockImplementation((dto) => dto),
    save: jest.fn().mockImplementation((dto) => Promise.resolve({ id: 'uuid-123', ...dto, createdAt: new Date() })),
    findAndCount: jest.fn().mockResolvedValue([[], 0]),
    findOne: jest.fn().mockResolvedValue(null),
  };

  const mockConfigService = {
    get: jest.fn().mockReturnValue('https://horizon-testnet.stellar.org'),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransactionService,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: getRepositoryToken(TransactionReplay), useValue: mockRepository },
      ],
    }).compile();

    service = module.get<TransactionService>(TransactionService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
