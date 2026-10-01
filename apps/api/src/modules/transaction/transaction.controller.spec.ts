import cookie from '@fastify/cookie';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test, TestingModule } from '@nestjs/testing';
import { Keypair } from '@stellar/stellar-sdk';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GraphController } from './graph.controller';
import { GraphService } from './graph.service';
import { TransactionController } from './transaction.controller';
import { TransactionService } from './transaction.service';

const JWT_SECRET = 'test-secret';
const ROOT = Keypair.random().publicKey();

describe('TransactionController / GraphController (#260)', () => {
  let app: NestFastifyApplication;
  let jwtService: JwtService;
  let transactionService: jest.Mocked<Pick<TransactionService, 'getReplayHistory'>>;
  let graphService: jest.Mocked<Pick<GraphService, 'buildGraph'>>;

  beforeAll(async () => {
    transactionService = {
      getReplayHistory: jest.fn().mockResolvedValue({ items: [], total: 0 }),
    };
    graphService = { buildGraph: jest.fn().mockResolvedValue({ nodes: [], edges: [] }) };
    const configValues: Record<string, string> = { JWT_SECRET };

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: JWT_SECRET })],
      controllers: [TransactionController, GraphController],
      providers: [
        { provide: TransactionService, useValue: transactionService },
        { provide: GraphService, useValue: graphService },
        JwtAuthGuard,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: string) => configValues[key] ?? defaultValue),
            getOrThrow: jest.fn((key: string) => {
              if (configValues[key] === undefined) throw new Error(`Missing config: ${key}`);
              return configValues[key];
            }),
          },
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.register(cookie);
    // Mirrors main.ts, so out-of-range query values fail exactly as in production.
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    jwtService = moduleRef.get(JwtService);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => jest.clearAllMocks());

  const inject = (opts: Parameters<NestFastifyApplication['inject']>[0]) =>
    app.getHttpAdapter().getInstance().inject(opts);
  const auth = () => ({
    authorization: `Bearer ${jwtService.sign({ sub: 'user-1', email: 'dev@example.com' }, { secret: JWT_SECRET })}`,
  });
  const history = (query = '') =>
    inject({ method: 'GET', url: `/transactions/replay/history${query}`, headers: auth() });

  describe('GET /transactions/replay/history', () => {
    it('passes validated pagination and the signed-in user to the service', async () => {
      const res = await history('?limit=10&offset=20');

      expect(res.statusCode).toBe(200);
      expect(transactionService.getReplayHistory).toHaveBeenCalledWith('user-1', 10, 20);
    });

    it('leaves omitted values to the service defaults', async () => {
      const res = await history();

      expect(res.statusCode).toBe(200);
      expect(transactionService.getReplayHistory).toHaveBeenCalledWith('user-1', undefined, undefined);
    });

    it.each([
      ['limit above 100', '?limit=101'],
      ['limit of 0', '?limit=0'],
      ['huge limit', '?limit=99999999'],
      ['negative limit', '?limit=-1'],
      ['non-numeric limit', '?limit=ten'],
    ])('rejects a %s with 400 before reaching the service', async (_label, query) => {
      const res = await history(query);

      expect(res.statusCode).toBe(400);
      expect(transactionService.getReplayHistory).not.toHaveBeenCalled();
    });

    it.each([
      ['negative offset', '?offset=-1'],
      ['offset past the maximum', '?offset=10001'],
      ['fractional offset', '?offset=1.5'],
      ['empty offset', '?offset='],
      ['whitespace-only offset', '?offset=%20'],
      ['empty limit', '?limit='],
    ])('rejects a %s with 400 before reaching the service', async (_label, query) => {
      const res = await history(query);

      expect(res.statusCode).toBe(400);
      expect(transactionService.getReplayHistory).not.toHaveBeenCalled();
    });

    it('rejects an unknown query parameter', async () => {
      const res = await history('?page=2');

      expect(res.statusCode).toBe(400);
    });

    it('requires authentication', async () => {
      const res = await inject({ method: 'GET', url: '/transactions/replay/history' });

      expect(res.statusCode).toBe(401);
      expect(transactionService.getReplayHistory).not.toHaveBeenCalled();
    });
  });

  describe('POST /transaction/graph', () => {
    const body = { rootAccount: ROOT, depth: 1, mode: 'signers' };

    it('rejects an unauthenticated request with 401 and never starts a traversal', async () => {
      const res = await inject({ method: 'POST', url: '/transaction/graph', payload: body });

      expect(res.statusCode).toBe(401);
      expect(graphService.buildGraph).not.toHaveBeenCalled();
    });

    it('builds the graph for a signed-in user', async () => {
      const res = await inject({ method: 'POST', url: '/transaction/graph', payload: body, headers: auth() });

      expect(res.statusCode).toBe(201);
      expect(graphService.buildGraph).toHaveBeenCalledWith(expect.objectContaining({ rootAccount: ROOT, depth: 1 }));
    });
  });
});
