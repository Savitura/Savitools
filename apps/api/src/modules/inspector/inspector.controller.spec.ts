import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { Keypair } from '@stellar/stellar-sdk';
import { VALIDATION_PIPE_OPTIONS } from '../../config/validation-pipe.config';
import { InspectorController } from './inspector.controller';
import { InspectorService } from './inspector.service';
import type { TransactionBreakdown } from './inspector.service';
import { MAX_STRKEY_BATCH_SIZE } from './strkey-validation';

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
    app.useGlobalPipes(new ValidationPipe(VALIDATION_PIPE_OPTIONS));
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

      const response = await app
        .getHttpAdapter()
        .getInstance()
        .inject({
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

      const response = await app
        .getHttpAdapter()
        .getInstance()
        .inject({
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

      const response = await app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'GET',
          url: `/inspector/tx/${hash}`,
        });

      expect(response.statusCode).toBe(200);
      expect(response.json().hash).toBe(hash);
      expect(inspect).toHaveBeenCalledWith(hash, 'testnet');
    });
  });

  describe('POST /inspector/strkey/validate', () => {
    const keypair = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 7));

    it('returns per-row results with a 200 and masks secret seeds', async () => {
      const response = await app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'POST',
          url: '/inspector/strkey/validate',
          payload: { inputs: [keypair.publicKey(), 'bogus', keypair.secret()] },
        });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.summary).toEqual({ total: 3, valid: 2, invalid: 1 });
      expect(body.results[0]).toMatchObject({ valid: true, keyType: 'ed25519_public_key' });
      expect(body.results[1].error.code).toBe('invalid_characters');
      expect(body.results[2]).toMatchObject({ valid: true, redacted: true });
      expect(response.body).not.toContain(keypair.secret());
    });

    it.each([
      ['an empty array', { inputs: [] }],
      ['a non-string entry', { inputs: [42] }],
      ['an oversized batch', { inputs: Array(MAX_STRKEY_BATCH_SIZE + 1).fill('G') }],
      ['an over-long value', { inputs: ['G'.repeat(257)] }],
      ['an unknown property', { inputs: ['G'], extra: true }],
    ])('rejects %s with a 400', async (_label, payload) => {
      const response = await app.getHttpAdapter().getInstance().inject({
        method: 'POST',
        url: '/inspector/strkey/validate',
        payload,
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('POST /inspector/strkey/validate/export', () => {
    it('returns the CSV with download headers', async () => {
      const inputs = [Keypair.fromRawEd25519Seed(Buffer.alloc(32, 8)).publicKey(), 'bogus'];
      const response = await app.getHttpAdapter().getInstance().inject({
        method: 'POST',
        url: '/inspector/strkey/validate/export',
        payload: { inputs },
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toBe('text/csv; charset=utf-8');
      expect(response.headers['content-disposition']).toBe(
        'attachment; filename="strkey-validation.csv"',
      );
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.body).toBe(service.exportStrKeyValidationCsv(inputs));
      expect(response.body.slice(1).trim().split('\n')).toHaveLength(3);
    });
  });
});
