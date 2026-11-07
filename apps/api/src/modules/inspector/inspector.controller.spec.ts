import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { InspectorController } from './inspector.controller';
import { InspectorService } from './inspector.service';
import type { TransactionBreakdown } from './inspector.service';

/**
 * Covers the decorators on InspectorController (Savitura/Savitools#410): the
 * CSV export route must bind `@Res({ passthrough: true })` and `@Query('network')`
 * so the reply headers are set and the service result is still returned.
 */
function sampleBreakdown(network: 'testnet' | 'mainnet' = 'testnet'): TransactionBreakdown {
  return {
    hash: 'a'.repeat(64),
    ledger: 1234,
    createdAt: '2026-08-31T12:00:00.000Z',
    sourceAccount: 'GSOURCE',
    sequenceNumber: '123',
    feeCharged: '300',
    maxFee: '300',
    memo: 'hello, world',
    memoType: 'text',
    timeBounds: null,
    signatures: [],
    success: true,
    resultCode: 'tx_success',
    resultExplanation: 'The transaction succeeded.',
    operationCount: 2,
    operations: [
      {
        index: 0,
        type: 'create_account',
        label: 'Create Account',
        fields: { destination: 'GDEST', startingBalance: '10 XLM' },
        sourceAccount: null,
        resultCode: 'op_success',
        resultExplanation: null,
        success: true,
        effects: [{ type: 'account_created', account: 'GDEST' }],
      },
      {
        index: 1,
        type: 'payment',
        label: 'Payment',
        fields: { destination: 'GDEST', amount: '5', asset: 'XLM' },
        sourceAccount: 'GSOURCE',
        resultCode: 'op_success',
        resultExplanation: null,
        success: true,
        effects: [],
      },
    ],
    rawJson: null,
    network,
    sorobanEvents: [],
    composerPayload: null,
  };
}

describe('InspectorController', () => {
  let app: NestFastifyApplication;
  let service: InspectorService;
  const hash = 'a'.repeat(64);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [InspectorController],
      providers: [InspectorService, { provide: ConfigService, useValue: new ConfigService() }],
    }).compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    service = moduleRef.get(InspectorService);
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('GET /inspector/tx/:hash/export', () => {
    it('returns the CSV with download headers', async () => {
      const inspect = jest
        .spyOn(service, 'inspectTransaction')
        .mockResolvedValue(sampleBreakdown());

      const response = await app.getHttpAdapter().getInstance().inject({
        method: 'GET',
        url: `/inspector/tx/${hash}/export`,
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toBe('text/csv; charset=utf-8');
      expect(response.headers['content-disposition']).toBe(
        `attachment; filename="transaction-${hash.slice(0, 12)}.csv"`,
      );
      expect(response.body).toBe(service.exportTransactionCsv(sampleBreakdown()));
      expect(response.body.slice(1).trim().split('\n')).toHaveLength(3);
      expect(inspect).toHaveBeenCalledWith(hash, 'testnet');
    });

    it('passes the network query parameter through', async () => {
      const inspect = jest
        .spyOn(service, 'inspectTransaction')
        .mockResolvedValue(sampleBreakdown('mainnet'));

      const response = await app.getHttpAdapter().getInstance().inject({
        method: 'GET',
        url: `/inspector/tx/${hash}/export?network=mainnet`,
      });

      expect(response.statusCode).toBe(200);
      expect(inspect).toHaveBeenCalledWith(hash, 'mainnet');
      expect(response.body).toContain('mainnet');
    });
  });

  describe('GET /inspector/tx/:hash', () => {
    it('defaults the network to testnet', async () => {
      const inspect = jest
        .spyOn(service, 'inspectTransaction')
        .mockResolvedValue(sampleBreakdown());

      const response = await app.getHttpAdapter().getInstance().inject({
        method: 'GET',
        url: `/inspector/tx/${hash}`,
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().hash).toBe(hash);
      expect(inspect).toHaveBeenCalledWith(hash, 'testnet');
    });
  });
});
