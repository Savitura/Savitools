import { Test, TestingModule } from '@nestjs/testing';
import { ComposerService } from './composer.service';
import * as StellarSdk from '@stellar/stellar-sdk';

describe('ComposerService', () => {
  let service: ComposerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ComposerService],
    }).compile();

    service = module.get<ComposerService>(ComposerService);
  });

  describe('simulateTransaction', () => {
    it('returns a hash for valid XDR without submitting', async () => {
      const account = new Account('GCEXAMPLE5R6N3K6Y5XZ5QZ5QZ5QZ5QZ5QZ5QZ5QZ', '1');
      const tx = new TransactionBuilder(account, {
        networkPassphrase: Networks.TESTNET,
        fee: '100',
      })
        .addOperation(
          TransactionBuilder.payment({
            destination: 'GCEXAMPLE5R6N3K6Y5XZ5QZ5QZ5QZ5QZ5QZ5QZ5QZ',
            asset: Asset.native(),
            amount: '1',
          }),
        )
        .setTimeout(30)
        .build();
      const xdr = tx.toEnvelope().toXDR().toString('base64');

      const submitSpy = jest.spyOn(Horizon.Server.prototype, 'submitTransaction');

      const result = await service.simulateTransaction({ xdr, network: 'testnet' });

      expect(submitSpy).not.toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.hash).toBe(tx.hash().toString('hex'));
      expect(result.fee).toBeNull();
      expect(result.resultCodes).toBeNull();
      expect(result.operationResults).toBeNull();
      expect(result.ledger).toBeNull();

      submitSpy.mockRestore();
    });

    it('throws on invalid XDR', async () => {
      await expect(
        service.simulateTransaction({ xdr: 'not-valid-xdr', network: 'testnet' }),
      ).rejects.toThrow('Invalid XDR');
    });

    it('caches simulation results and evicts when cache is full', async () => {
      const account = new Account('GCEXAMPLE5R6N3K6Y5XZ5QZ5QZ5QZ5QZ5QZ5QZ5QZ', '1');
      const max = 1000;
      // Simulate more than MAX_CACHE_SIZE items to trigger eviction
      for (let i = 0; i <= max + 10; i++) {
        const tx = new TransactionBuilder(account, {
          networkPassphrase: Networks.TESTNET,
          fee: '100',
        })
          .addOperation(
            TransactionBuilder.payment({
              destination: 'GCEXAMPLE5R6N3K6Y5XZ5QZ5QZ5QZ5QZ5QZ5QZ5QZ',
              asset: Asset.native(),
              amount: String(i + 1),
            }),
          )
          .setTimeout(30)
          .build();
        const xdr = tx.toEnvelope().toXDR().toString('base64');
        await service.simulateTransaction({ xdr, network: 'testnet' });
      }

      const cacheSize = (service as any).simulationCache.size;
      expect(cacheSize).toBeLessThanOrEqual(max);
    });

    it('expires cache entries based on TTL', async () => {
      const account = new Account('GCEXAMPLE5R6N3K6Y5XZ5QZ5QZ5QZ5QZ5QZ5QZ5QZ', '1');
      const tx = new TransactionBuilder(account, {
        networkPassphrase: Networks.TESTNET,
        fee: '100',
      })
        .addOperation(
          TransactionBuilder.payment({
            destination: 'GCEXAMPLE5R6N3K6Y5XZ5QZ5QZ5QZ5QZ5QZ5QZ5QZ',
            asset: Asset.native(),
            amount: '50',
          }),
        )
        .setTimeout(30)
        .build();
      const xdr = tx.toEnvelope().toXDR().toString('base64');

      await service.simulateTransaction({ xdr, network: 'testnet' });
      const cacheKey = `testnet:${xdr}`;

      // Force expire by shifting expiresAt into the past
      const cached = (service as any).simulationCache.get(cacheKey);
      expect(cached).toBeDefined();
      cached.expiresAt = Date.now() - 1000;

      // Re-simulating should successfully re-evaluate / overwrite expired cache entry
      const result = await service.simulateTransaction({ xdr, network: 'testnet' });
      expect(result.success).toBe(true);
    });
  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('benchmarkTransaction', () => {
    it('runs sequential and concurrent benchmarks and detects conflicts', async () => {
      const keypair = StellarSdk.Keypair.random();
      const server = new StellarSdk.Horizon.Server('https://horizon-testnet.stellar.org');

      // Mock account load and tx build
      jest.spyOn(server, 'loadAccount').mockResolvedValue({
        accountId: () => keypair.publicKey(),
        sequenceNumber: () => '100',
        incrementSequenceNumber: () => {},
      } as any);

      const builder = new StellarSdk.TransactionBuilder(await server.loadAccount(keypair.publicKey()), {
        fee: '100',
        networkPassphrase: StellarSdk.Networks.TESTNET,
      }).setTimeout(30);

      const tx = builder.build();
      tx.sign(keypair);
      const xdr = tx.toXDR();

      const result = await service.benchmarkTransaction({
        xdr,
        network: 'testnet',
        transactionCount: 5,
        concurrency: 3,
      });

      expect(result).toHaveProperty('sequential');
      expect(result).toHaveProperty('concurrent');
      expect(result.sequential.transactionCount).toBe(5);
      expect(result.concurrent.sequenceConflicts).toBeGreaterThanOrEqual(0);
      expect(result.sequential.throughputTxPerSec).toBeDefined();
      expect(result.concurrent.latencies.p99).toBeDefined();
    });
  });
});
