import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { NotFoundException } from '@nestjs/common';
import * as StellarSdk from '@stellar/stellar-sdk';
import { GraphService } from './graph.service';
import { GraphMode, GraphQueryDto } from './dto/graph.dto';

function makeAccountFixture(
  publicKey: string,
  signers: Array<{ key: string; weight: number }>,
  balances: unknown[] = [],
) {
  return {
    publicKey,
    signers,
    balances,
  };
}

describe('GraphService', () => {
  let service: GraphService;
  let loadAccountMock: jest.Mock;
  let offersForAccountMock: jest.Mock;
  let paymentsForAccountMock: jest.Mock;
  let offersSellingMock: jest.Mock;

  const ROOT = StellarSdk.Keypair.random().publicKey();
  const SIGNER_A = StellarSdk.Keypair.random().publicKey();

  const validDto = (overrides: Partial<GraphQueryDto> = {}): GraphQueryDto => ({
    rootAccount: ROOT,
    depth: 1,
    mode: GraphMode.SIGNERS,
    ...overrides,
  });

  beforeEach(async () => {
    loadAccountMock = jest.fn();
    offersForAccountMock = jest.fn();
    paymentsForAccountMock = jest.fn();
    offersSellingMock = jest.fn();

    const module = await Test.createTestingModule({
      providers: [
        GraphService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue(undefined),
          },
        },
      ],
    }).compile();

    service = module.get(GraphService);

    const horizonStub = {
      loadAccount: loadAccountMock,
      offers: jest.fn().mockReturnValue({
        forAccount: offersForAccountMock,
        selling: offersSellingMock,
      }),
      payments: jest.fn().mockReturnValue({
        forAccount: paymentsForAccountMock,
      }),
    };
    (service as any).horizon = jest.fn().mockReturnValue(horizonStub);
  });

  describe('buildGraph validation', () => {
    it('throws NotFoundException when the root account does not exist', async () => {
      loadAccountMock.mockResolvedValue(null);

      await expect(service.buildGraph(validDto())).rejects.toThrow(
        NotFoundException,
      );
    });

    it('returns root node when signers mode finds no signers', async () => {
      loadAccountMock.mockResolvedValue(makeAccountFixture(ROOT, []));
      offersForAccountMock.mockReturnValue({
        limit: jest.fn().mockReturnValue({
          call: jest.fn().mockResolvedValue({ records: [] }),
        }),
      });
      paymentsForAccountMock.mockReturnValue({
        limit: jest.fn().mockReturnValue({
          call: jest.fn().mockResolvedValue({ records: [] }),
        }),
      });

      const result = await service.buildGraph(validDto());

      expect(result.nodeCount).toBe(1);
      expect(result.nodes[0].id).toBe(ROOT);
      expect(result.edges).toHaveLength(0);
    });
  });

  describe('buildSignersGraph', () => {
    it('creates signs_for edges and nodes for signers at depth 1', async () => {
      loadAccountMock.mockResolvedValue(
        makeAccountFixture(ROOT, [{ key: SIGNER_A, weight: 1 }]),
      );

      const result = await service.buildGraph(
        validDto({ mode: GraphMode.SIGNERS, depth: 1 }),
      );

      expect(result.nodes.some((n) => n.id === SIGNER_A)).toBe(true);
      const edge = result.edges.find(
        (e) =>
          e.relationship === 'signs_for' &&
          e.source === SIGNER_A &&
          e.target === ROOT,
      );
      expect(edge).toBeDefined();
      expect(edge!.metadata.weight).toBe(1);
    });

    it('marks multisig accounts with 2+ signers', async () => {
      loadAccountMock.mockImplementation((pk: string) =>
        Promise.resolve(
          pk === ROOT
            ? makeAccountFixture(ROOT, [
                { key: SIGNER_A, weight: 1 },
                { key: 'GCO_SIGNER_B', weight: 1 },
              ])
            : makeAccountFixture(pk, []),
        ),
      );

      const result = await service.buildGraph(
        validDto({ mode: GraphMode.SIGNERS, depth: 1 }),
      );

      const rootNode = result.nodes.find((n) => n.id === ROOT);
      expect(rootNode!.type).toBe('multisig');
      expect(result.edges.some((e) => e.relationship === 'co_signer')).toBe(
        true,
      );
    });

    it('traverses up to depth 2 without duplicating nodes', async () => {
      loadAccountMock.mockImplementation((pk: string) => {
        if (pk === ROOT) {
          return Promise.resolve(
            makeAccountFixture(ROOT, [{ key: SIGNER_A, weight: 1 }]),
          );
        }
        if (pk === SIGNER_A) {
          return Promise.resolve(
            makeAccountFixture(SIGNER_A, [{ key: 'GDEPTH3', weight: 1 }]),
          );
        }
        return Promise.resolve(makeAccountFixture(pk, []));
      });

      const result = await service.buildGraph(
        validDto({ mode: GraphMode.SIGNERS, depth: 2 }),
      );

      const ids = result.nodes.map((n) => n.id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(
        result.edges.filter((e) => e.relationship === 'signs_for').length,
      ).toBeGreaterThanOrEqual(2);
    });
  });

  describe('buildOffersGraph', () => {
    it('links counterparties that match the root offer', async () => {
      loadAccountMock.mockImplementation((pk: string) =>
        Promise.resolve(makeAccountFixture(pk, [])),
      );

      offersForAccountMock.mockReturnValue({
        limit: jest.fn().mockReturnValue({
          call: jest.fn().mockResolvedValue({
            records: [
              {
                id: 'offer-1',
                seller: ROOT,
                selling: { asset_type: 'native' },
                buying: {
                  asset_type: 'credit_alphanum4',
                  asset_code: 'USDC',
                  asset_issuer: ROOT,
                },
                price: '0.5',
              },
            ],
          }),
        }),
      });

      const COUNTER = StellarSdk.Keypair.random().publicKey();
      offersSellingMock.mockReturnValue({
        buying: jest.fn().mockReturnValue({
          limit: jest.fn().mockReturnValue({
            call: jest.fn().mockResolvedValue({
              records: [
                {
                  seller: COUNTER,
                  price: '2',
                  selling: {
                    asset_type: 'credit_alphanum4',
                    asset_code: 'USDC',
                    asset_issuer: ROOT,
                  },
                  buying: { asset_type: 'native' },
                },
              ],
            }),
          }),
        }),
      });

      const result = await service.buildGraph(
        validDto({ mode: GraphMode.OFFERS }),
      );

      expect(
        result.edges.some((e) => e.relationship === 'offer_match'),
      ).toBe(true);
    });
  });

  describe('buildPaymentsGraph', () => {
    it('creates payment edges from last transactions', async () => {
      loadAccountMock.mockImplementation((pk: string) =>
        Promise.resolve(makeAccountFixture(pk, [])),
      );

      paymentsForAccountMock.mockReturnValue({
        limit: jest.fn().mockReturnValue({
          call: jest.fn().mockResolvedValue({
            records: [
              {
                type: 'payment',
                from: 'GSENDER12345678901234567890123456789012345678901234',
                to: ROOT,
                amount: '100.5',
                asset_type: 'native',
                asset_code: undefined,
                transaction_hash: 'tx-1',
              },
            ],
          }),
        }),
      });

      const result = await service.buildGraph(
        validDto({ mode: GraphMode.PAYMENTS }),
      );

      const edge = result.edges.find(
        (e) =>
          e.relationship === 'payment' &&
          e.source === 'GSENDER12345678901234567890123456789012345678901234' &&
          e.target === ROOT,
      );
      expect(edge).toBeDefined();
      expect(edge!.metadata.amount).toBe('100.5');
    });
  });

  describe('buildGraph all mode', () => {
    it('merges multiple modes into one graph', async () => {
      loadAccountMock.mockImplementation((pk: string) =>
        Promise.resolve(
          makeAccountFixture(pk, [{ key: SIGNER_A, weight: 1 }]),
        ),
      );
      offersForAccountMock.mockReturnValue({
        limit: jest.fn().mockReturnValue({
          call: jest.fn().mockResolvedValue({ records: [] }),
        }),
      });
      paymentsForAccountMock.mockReturnValue({
        limit: jest.fn().mockReturnValue({
          call: jest.fn().mockResolvedValue({ records: [] }),
        }),
      });

      const result = await service.buildGraph(
        validDto({ mode: GraphMode.ALL, depth: 1 }),
      );

      expect(result.nodeCount).toBeGreaterThanOrEqual(2);
    });
  });

  describe('traversal limits (#260)', () => {
    /** Rebuilds the service with GRAPH_* overrides, keeping the same Horizon stub. */
    const withLimits = async (values: Record<string, string>) => {
      type WithHorizon = { horizon: unknown };
      const stub = (service as unknown as WithHorizon).horizon;
      const module = await Test.createTestingModule({
        providers: [
          GraphService,
          { provide: ConfigService, useValue: { get: jest.fn((key: string) => values[key]) } },
        ],
      }).compile();
      service = module.get(GraphService);
      (service as unknown as WithHorizon).horizon = stub;
    };
    const keys = (n: number) => Array.from({ length: n }, () => StellarSdk.Keypair.random().publicKey());
    const expectEdgesBetweenNodes = (result: Awaited<ReturnType<GraphService['buildGraph']>>) => {
      const ids = new Set(result.nodes.map((n) => n.id));
      for (const e of result.edges) {
        expect(ids.has(e.source) && ids.has(e.target)).toBe(true);
      }
    };

    it('reports a complete graph, its Horizon calls and the limits applied', async () => {
      loadAccountMock.mockResolvedValue(makeAccountFixture(ROOT, [{ key: SIGNER_A, weight: 1 }]));

      const result = await service.buildGraph(validDto({ depth: 1 }));

      expect(result.truncated).toBe(false);
      expect(result.truncatedBy).toBeNull();
      expect(result.horizonRequests).toBe(loadAccountMock.mock.calls.length);
      expect(result.limits).toEqual({ maxDepth: 3, maxNodes: 150, maxHorizonRequests: 60 });
    });

    it('stops at the node limit and returns a partial graph whose edges all have both ends', async () => {
      await withLimits({ GRAPH_MAX_NODES: '4' });
      loadAccountMock.mockImplementation((pk: string) =>
        Promise.resolve(
          pk === ROOT ? makeAccountFixture(ROOT, keys(10).map((key) => ({ key, weight: 1 }))) : makeAccountFixture(pk, []),
        ),
      );

      const result = await service.buildGraph(validDto({ depth: 1 }));

      expect(result.truncated).toBe(true);
      expect(result.truncatedBy).toBe('node_limit');
      expect(result.nodeCount).toBe(4);
      expectEdgesBetweenNodes(result);
    });

    it('stops at the Horizon request limit however deep the signer chain goes', async () => {
      await withLimits({ GRAPH_MAX_HORIZON_REQUESTS: '3' });
      // Every account is signed by two brand-new accounts: unbounded without a budget.
      loadAccountMock.mockImplementation((pk: string) =>
        Promise.resolve(makeAccountFixture(pk, keys(2).map((key) => ({ key, weight: 1 })))),
      );

      const result = await service.buildGraph(validDto({ depth: 3 }));

      expect(loadAccountMock).toHaveBeenCalledTimes(3);
      expect(result.horizonRequests).toBe(3);
      expect(result.truncated).toBe(true);
      expect(result.truncatedBy).toBe('horizon_request_limit');
      expectEdgesBetweenNodes(result);
    });

    it('charges counter-offer queries to the request budget', async () => {
      await withLimits({ GRAPH_MAX_HORIZON_REQUESTS: '3' });
      loadAccountMock.mockImplementation((pk: string) => Promise.resolve(makeAccountFixture(pk, [])));
      const offer = (id: number) => ({
        id: `offer-${id}`,
        seller: ROOT,
        selling: { asset_type: 'native' },
        buying: { asset_type: 'credit_alphanum4', asset_code: 'USDC', asset_issuer: ROOT },
        price: '1',
      });
      offersForAccountMock.mockReturnValue({
        limit: jest.fn().mockReturnValue({
          call: jest.fn().mockResolvedValue({ records: Array.from({ length: 50 }, (_, i) => offer(i)) }),
        }),
      });
      const counterCall = jest.fn().mockResolvedValue({ records: [] });
      offersSellingMock.mockReturnValue({
        buying: jest.fn().mockReturnValue({ limit: jest.fn().mockReturnValue({ call: counterCall }) }),
      });

      const result = await service.buildGraph(validDto({ mode: GraphMode.OFFERS }));

      // root account + offers list + one counter-offer query; 49 offers never queried
      expect(counterCall).toHaveBeenCalledTimes(1);
      expect(result.horizonRequests).toBe(3);
      expect(result.truncatedBy).toBe('horizon_request_limit');
    });

    it('fills the node limit exactly from payments without truncating (the root is not counted twice)', async () => {
      await withLimits({ GRAPH_MAX_NODES: '3' });
      loadAccountMock.mockImplementation((pk: string) => Promise.resolve(makeAccountFixture(pk, [])));
      const [a, b] = keys(2);
      const payment = (from: string, to: string, hash: string) => ({
        type: 'payment', from, to, amount: '1', asset_type: 'native', transaction_hash: hash,
      });
      paymentsForAccountMock.mockReturnValue({
        limit: jest.fn().mockReturnValue({
          call: jest.fn().mockResolvedValue({ records: [payment(ROOT, a, 't1'), payment(ROOT, b, 't2')] }),
        }),
      });

      const result = await service.buildGraph(validDto({ mode: GraphMode.PAYMENTS }));

      expect(result.nodes.map((n) => n.id).sort()).toEqual([ROOT, a, b].sort());
      expect(result.edges).toHaveLength(2);
      expect(result.truncated).toBe(false);
    });

    it('does not count a node the signers pass already added when offers match it (ALL mode)', async () => {
      await withLimits({ GRAPH_MAX_NODES: '2' });
      loadAccountMock.mockImplementation((pk: string) =>
        Promise.resolve(pk === ROOT ? makeAccountFixture(ROOT, [{ key: SIGNER_A, weight: 1 }]) : makeAccountFixture(pk, [])),
      );
      offersForAccountMock.mockReturnValue({
        limit: jest.fn().mockReturnValue({
          call: jest.fn().mockResolvedValue({
            records: [{
              id: 'o1', seller: ROOT, price: '1', selling: { asset_type: 'native' },
              buying: { asset_type: 'credit_alphanum4', asset_code: 'USDC', asset_issuer: ROOT },
            }],
          }),
        }),
      });
      offersSellingMock.mockReturnValue({
        buying: jest.fn().mockReturnValue({
          limit: jest.fn().mockReturnValue({
            call: jest.fn().mockResolvedValue({ records: [{ seller: SIGNER_A, price: '1' }] }),
          }),
        }),
      });
      paymentsForAccountMock.mockReturnValue({
        limit: jest.fn().mockReturnValue({ call: jest.fn().mockResolvedValue({ records: [] }) }),
      });

      const result = await service.buildGraph(validDto({ mode: GraphMode.ALL, depth: 1 }));

      expect(result.nodeCount).toBe(2);
      expect(result.edges.some((e) => e.relationship === 'offer_match' && e.source === SIGNER_A)).toBe(true);
      expect(result.truncated).toBe(false);
    });

    it('makes no further Horizon calls in later modes once the node limit is hit', async () => {
      await withLimits({ GRAPH_MAX_NODES: '2' });
      loadAccountMock.mockImplementation((pk: string) =>
        Promise.resolve(pk === ROOT ? makeAccountFixture(ROOT, keys(5).map((key) => ({ key, weight: 1 }))) : makeAccountFixture(pk, [])),
      );

      const result = await service.buildGraph(validDto({ mode: GraphMode.ALL, depth: 1 }));

      expect(result.truncatedBy).toBe('node_limit');
      expect(offersForAccountMock).not.toHaveBeenCalled();
      expect(paymentsForAccountMock).not.toHaveBeenCalled();
    });

    it('ignores a non-numeric or non-positive override', async () => {
      await withLimits({ GRAPH_MAX_NODES: 'lots', GRAPH_MAX_HORIZON_REQUESTS: '0' });
      loadAccountMock.mockResolvedValue(makeAccountFixture(ROOT, []));

      const result = await service.buildGraph(validDto());

      expect(result.limits).toEqual({ maxDepth: 3, maxNodes: 150, maxHorizonRequests: 60 });
    });
  });
});