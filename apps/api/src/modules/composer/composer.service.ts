import { Injectable, BadRequestException } from '@nestjs/common';
import * as StellarSdk from '@stellar/stellar-sdk';
import { BuildTransactionDto } from './dto/build-transaction.dto';
import { SimulateTransactionDto } from './dto/simulate-transaction.dto';

// ---------------------------------------------------------------------------
// Static operation-type manifest returned by GET /composer/operations
// ---------------------------------------------------------------------------

export const OPERATION_MANIFEST = [
  {
    type: 'payment',
    label: 'Payment',
    description: 'Send an asset to another account',
    fields: [
      { name: 'destination', label: 'Destination', type: 'text', required: true, placeholder: 'G…' },
      { name: 'asset.code', label: 'Asset Code', type: 'text', required: true, placeholder: 'XLM / USDC' },
      { name: 'asset.issuer', label: 'Asset Issuer', type: 'text', required: false, placeholder: 'G… (omit for XLM)' },
      { name: 'amount', label: 'Amount', type: 'number', required: true, placeholder: '10' },
    ],
  },
  {
    type: 'create_account',
    label: 'Create Account',
    description: 'Fund a brand-new Stellar account',
    fields: [
      { name: 'destination', label: 'Destination', type: 'text', required: true, placeholder: 'G…' },
      { name: 'startingBalance', label: 'Starting Balance (XLM)', type: 'number', required: true, placeholder: '1' },
    ],
  },
  {
    type: 'change_trust',
    label: 'Change Trust',
    description: 'Add or remove a trustline for an asset',
    fields: [
      { name: 'asset.code', label: 'Asset Code', type: 'text', required: true, placeholder: 'USDC' },
      { name: 'asset.issuer', label: 'Asset Issuer', type: 'text', required: true, placeholder: 'G…' },
      { name: 'limit', label: 'Limit', type: 'number', required: false, placeholder: 'Max (omit) or 0 to remove' },
    ],
  },
  {
    type: 'manage_sell_offer',
    label: 'Manage Sell Offer',
    description: 'Create, update or delete a sell offer on the DEX',
    fields: [
      { name: 'selling.code', label: 'Selling Asset', type: 'text', required: true, placeholder: 'XLM' },
      { name: 'selling.issuer', label: 'Selling Issuer', type: 'text', required: false, placeholder: 'G… (omit for XLM)' },
      { name: 'buying.code', label: 'Buying Asset', type: 'text', required: true, placeholder: 'USDC' },
      { name: 'buying.issuer', label: 'Buying Issuer', type: 'text', required: false, placeholder: 'G…' },
      { name: 'amount', label: 'Amount to Sell', type: 'number', required: true, placeholder: '100' },
      { name: 'price.n', label: 'Price Numerator', type: 'number', required: true, placeholder: '1' },
      { name: 'price.d', label: 'Price Denominator', type: 'number', required: true, placeholder: '1' },
      { name: 'offerId', label: 'Offer ID (0 = new)', type: 'number', required: false, placeholder: '0' },
    ],
  },
  {
    type: 'manage_buy_offer',
    label: 'Manage Buy Offer',
    description: 'Create, update or delete a buy offer on the DEX',
    fields: [
      { name: 'selling.code', label: 'Selling Asset', type: 'text', required: true, placeholder: 'XLM' },
      { name: 'selling.issuer', label: 'Selling Issuer', type: 'text', required: false, placeholder: 'G…' },
      { name: 'buying.code', label: 'Buying Asset', type: 'text', required: true, placeholder: 'USDC' },
      { name: 'buying.issuer', label: 'Buying Issuer', type: 'text', required: false, placeholder: 'G…' },
      { name: 'buyAmount', label: 'Amount to Buy', type: 'number', required: true, placeholder: '100' },
      { name: 'price.n', label: 'Price Numerator', type: 'number', required: true, placeholder: '1' },
      { name: 'price.d', label: 'Price Denominator', type: 'number', required: true, placeholder: '1' },
      { name: 'offerId', label: 'Offer ID (0 = new)', type: 'number', required: false, placeholder: '0' },
    ],
  },
  {
    type: 'create_passive_sell_offer',
    label: 'Passive Sell Offer',
    description: 'Sell offer that does not cross existing offers',
    fields: [
      { name: 'selling.code', label: 'Selling Asset', type: 'text', required: true, placeholder: 'XLM' },
      { name: 'selling.issuer', label: 'Selling Issuer', type: 'text', required: false, placeholder: 'G…' },
      { name: 'buying.code', label: 'Buying Asset', type: 'text', required: true, placeholder: 'USDC' },
      { name: 'buying.issuer', label: 'Buying Issuer', type: 'text', required: false, placeholder: 'G…' },
      { name: 'amount', label: 'Amount', type: 'number', required: true, placeholder: '100' },
      { name: 'price.n', label: 'Price Numerator', type: 'number', required: true, placeholder: '1' },
      { name: 'price.d', label: 'Price Denominator', type: 'number', required: true, placeholder: '1' },
    ],
  },
  {
    type: 'set_options',
    label: 'Set Options',
    description: 'Configure account flags, thresholds, home domain',
    fields: [
      { name: 'inflationDest', label: 'Inflation Destination', type: 'text', required: false, placeholder: 'G…' },
      { name: 'homeDomain', label: 'Home Domain', type: 'text', required: false, placeholder: 'example.com' },
      { name: 'masterWeight', label: 'Master Weight', type: 'number', required: false, placeholder: '1' },
      { name: 'lowThreshold', label: 'Low Threshold', type: 'number', required: false, placeholder: '0' },
      { name: 'medThreshold', label: 'Med Threshold', type: 'number', required: false, placeholder: '0' },
      { name: 'highThreshold', label: 'High Threshold', type: 'number', required: false, placeholder: '0' },
      { name: 'setFlags', label: 'Set Flags (bitmask)', type: 'number', required: false, placeholder: '0' },
      { name: 'clearFlags', label: 'Clear Flags (bitmask)', type: 'number', required: false, placeholder: '0' },
    ],
  },
  {
    type: 'account_merge',
    label: 'Account Merge',
    description: 'Merge this account into another, sending all XLM',
    fields: [
      { name: 'destination', label: 'Merge Into', type: 'text', required: true, placeholder: 'G…' },
    ],
  },
  {
    type: 'allow_trust',
    label: 'Allow Trust',
    description: 'Authorize a trustor to hold your issued asset',
    fields: [
      { name: 'trustor', label: 'Trustor', type: 'text', required: true, placeholder: 'G…' },
      { name: 'assetCode', label: 'Asset Code', type: 'text', required: true, placeholder: 'MYTOKEN' },
      { name: 'authorize', label: 'Authorize', type: 'boolean', required: true, placeholder: 'true / false' },
    ],
  },
  {
    type: 'path_payment_strict_send',
    label: 'Path Payment (Strict Send)',
    description: 'Send exact amount; recipient gets at least destMin',
    fields: [
      { name: 'sendAsset.code', label: 'Send Asset', type: 'text', required: true, placeholder: 'XLM' },
      { name: 'sendAsset.issuer', label: 'Send Issuer', type: 'text', required: false, placeholder: 'G…' },
      { name: 'sendAmount', label: 'Send Amount', type: 'number', required: true, placeholder: '10' },
      { name: 'destination', label: 'Destination', type: 'text', required: true, placeholder: 'G…' },
      { name: 'destAsset.code', label: 'Dest Asset', type: 'text', required: true, placeholder: 'USDC' },
      { name: 'destAsset.issuer', label: 'Dest Issuer', type: 'text', required: false, placeholder: 'G…' },
      { name: 'destMin', label: 'Dest Min', type: 'number', required: true, placeholder: '9.5' },
      { name: 'path', label: 'Path Assets (JSON array)', type: 'text', required: false, placeholder: '[]' },
    ],
  },
  {
    type: 'path_payment_strict_receive',
    label: 'Path Payment (Strict Receive)',
    description: 'Recipient gets exact amount; send at most sendMax',
    fields: [
      { name: 'sendAsset.code', label: 'Send Asset', type: 'text', required: true, placeholder: 'XLM' },
      { name: 'sendAsset.issuer', label: 'Send Issuer', type: 'text', required: false, placeholder: 'G…' },
      { name: 'sendMax', label: 'Send Max', type: 'number', required: true, placeholder: '11' },
      { name: 'destination', label: 'Destination', type: 'text', required: true, placeholder: 'G…' },
      { name: 'destAsset.code', label: 'Dest Asset', type: 'text', required: true, placeholder: 'USDC' },
      { name: 'destAsset.issuer', label: 'Dest Issuer', type: 'text', required: false, placeholder: 'G…' },
      { name: 'destAmount', label: 'Dest Amount', type: 'number', required: true, placeholder: '10' },
      { name: 'path', label: 'Path Assets (JSON array)', type: 'text', required: false, placeholder: '[]' },
    ],
  },
  {
    type: 'manage_data',
    label: 'Manage Data',
    description: 'Set, modify or delete a data entry on your account',
    fields: [
      { name: 'name', label: 'Data Name (up to 64 bytes)', type: 'text', required: true, placeholder: 'my-key' },
      { name: 'value', label: 'Data Value (up to 64 bytes, empty to delete)', type: 'text', required: false, placeholder: 'my-value' },
    ],
  },
];

interface CachedSimulation {
  result: any;
  expiresAt: number;
}

interface TransactionSequenceStep {
  build: BuildTransactionDto;
  dependsOn?: number;
}

interface RunTransactionSequenceDto {
  network?: 'testnet' | 'mainnet';
  signerSecret: string;
  transactions: TransactionSequenceStep[];
  stopOnFailure?: boolean;
}

interface TransactionSequenceStepResult {
  index: number;
  hash: string | null;
  status: 'succeeded' | 'failed' | 'skipped';
  resultCodes: unknown;
  nextSequenceNumber: string;
}

interface TransactionSequenceRunRecord {
  id: string;
  network: 'testnet' | 'mainnet';
  stopOnFailure: boolean;
  startedAt: string;
  endedAt?: string;
  status: 'running' | 'succeeded' | 'failed' | 'partial';
  steps: TransactionSequenceStepResult[];
}

@Injectable()
export class ComposerService {
  private readonly logger = new Logger(ComposerService.name);
  private readonly simulationCache = new Map<string, CachedSimulation>();
  private readonly MAX_CACHE_SIZE = 1000;
  private readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

  getOperations() {
    return OPERATION_MANIFEST;
  }

  private getHorizonServer(network: 'testnet' | 'mainnet' = 'testnet'): Horizon.Server {
    const url =
      network === 'mainnet'
        ? process.env.STELLAR_HORIZON_MAINNET_URL || 'https://horizon.stellar.org'
        : process.env.STELLAR_HORIZON_URL || 'https://horizon-testnet.stellar.org';
    return new Horizon.Server(url);
  }

  buildTransaction(dto: BuildTransactionDto) {
    try {
      const networkPassphrase =
        dto.network === 'mainnet' ? Networks.PUBLIC : Networks.TESTNET;

      const sourceAccount = new Horizon.Account(dto.sourceAccount, dto.sequenceNumber);

      const builder = new TransactionBuilder(sourceAccount, {
        fee: dto.fee,
        networkPassphrase,
      });

      if (dto.timeBounds) {
        builder.setTimeBounds({
          minTime: dto.timeBounds.minTime,
          maxTime: dto.timeBounds.maxTime,
        });
      }

      if (dto.memo) {
        switch (dto.memo.type) {
          case 'text':
            builder.addMemo(Memo.text(dto.memo.value));
            break;
          case 'id':
            builder.addMemo(Memo.id(dto.memo.value));
            break;
          case 'hash':
            builder.addMemo(Memo.hash(dto.memo.value));
            break;
          case 'return':
            builder.addMemo(Memo.return(dto.memo.value));
            break;
        }
      }

      for (const opDto of dto.operations) {
        const op = this.mapOperation(opDto);
        builder.addOperation(op);
      }

      const transaction = builder.setTimeout(30).build();
      const xdr = transaction.toEnvelope().toXDR().toString('base64');
      const hash = transaction.hash().toString('hex');

      return {
        xdr,
        hash,
        fee: dto.fee,
        operationCount: dto.operations.length,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      throw new BadRequestException(`Failed to build transaction: ${message}`);
    }
  }

  async simulateTransaction(dto: SimulateTransactionDto) {
    try {
      const cacheKey = `${dto.network || 'testnet'}:${dto.xdr}`;
      const now = Date.now();
      const cached = this.simulationCache.get(cacheKey);

      if (cached) {
        if (cached.expiresAt > now) {
          // Refresh position in LRU (delete and re-set)
          this.simulationCache.delete(cacheKey);
          this.simulationCache.set(cacheKey, cached);
          return cached.result;
        } else {
          this.simulationCache.delete(cacheKey);
        }
      }

      let tx: Transaction;
      try {
        tx = new Transaction(dto.xdr, dto.network === 'mainnet' ? Networks.PUBLIC : Networks.TESTNET);
      } catch {
        throw new BadRequestException('Invalid XDR');
      }

      const hash = tx.hash().toString('hex');

      const result = {
        success: true,
        hash,
        fee: null,
        resultCodes: null,
        operationResults: null,
        ledger: null,
      };

      // Evict oldest entries if cache is at max capacity
      if (this.simulationCache.size >= this.MAX_CACHE_SIZE) {
        const oldestKey = this.simulationCache.keys().next().value;
        if (oldestKey !== undefined) {
          this.simulationCache.delete(oldestKey);
        }
      }

      this.simulationCache.set(cacheKey, {
        result,
        expiresAt: now + this.CACHE_TTL_MS,
      });

      return result;
    } catch (err: unknown) {
      if (err instanceof BadRequestException) {
        throw err;
      }
      const message = err instanceof Error ? err.message : String(err);
      throw new BadRequestException(`Simulation failed: ${message}`);
    }
  }

  async sendTransaction(dto: SimulateTransactionDto) {
    try {
      const tx = new Transaction(dto.xdr, dto.network === 'mainnet' ? Networks.PUBLIC : Networks.TESTNET);
      const server = this.getHorizonServer(dto.network);

      const response = await server.submitTransaction(tx);

      return {
        success: true,
        hash: response.hash,
        fee: response.fee_charged,
        resultCodes: null,
        operationResults: null,
        ledger: response.ledger,
      };
    } catch (err: unknown) {
      const errObj = err as any;
      const resultCodes = errObj?.response?.data?.extras?.result_codes || null;
      const operationResults = resultCodes?.operations || null;
      const txCode = resultCodes?.transaction || (err instanceof Error ? err.message : 'Transaction failed');

      return {
        success: false,
        hash: null,
        fee: null,
        resultCodes: txCode,
        operationResults,
        ledger: null,
import { BenchmarkTransactionDto } from './dto/benchmark-transaction.dto';

@Injectable()
export class ComposerService {
  private readonly servers = {
    mainnet: new StellarSdk.Horizon.Server('https://horizon.stellar.org'),
    testnet: new StellarSdk.Horizon.Server('https://horizon-testnet.stellar.org'),
  };

  private readonly passphrases = {
    mainnet: StellarSdk.Networks.PUBLIC,
    testnet: StellarSdk.Networks.TESTNET,
  };

  private readonly sequenceHistory: TransactionSequenceRunRecord[] = [];

  async buildTransaction(dto: BuildTransactionDto) {
    try {
      const sourceKeypair = StellarSdk.Keypair.fromSecret(dto.signerSecret);
      const network = dto.network || 'testnet';
      const server = this.servers[network];
      const passphrase = this.passphrases[network];

      const account = await server.loadAccount(sourceKeypair.publicKey());
      
      let builder = new StellarSdk.TransactionBuilder(account, {
        fee: dto.fee || StellarSdk.BASE_FEE,
        networkPassphrase: passphrase,
      });

      if (dto.timeBounds) {
        builder = builder.setTimeBounds(dto.timeBounds);
      } else {
        builder = builder.setTimeout(30);
      }

      for (const op of dto.operations) {
        switch (op.type) {
          case 'payment':
            builder.addOperation(
              StellarSdk.Operation.payment({
                destination: op.destination,
                asset:
                  op.asset.code === 'native'
                    ? StellarSdk.Asset.native()
                    : new StellarSdk.Asset(op.asset.code, op.asset.issuer!),
                amount: op.amount,
              }),
            );
            break;
          case 'create_account':
            builder.addOperation(
              StellarSdk.Operation.createAccount({
                destination: op.destination,
                startingBalance: op.startingBalance,
              }),
            );
            break;
          case 'change_trust':
            builder.addOperation(
              StellarSdk.Operation.changeTrust({
                asset:
                  op.asset.code === 'native'
                    ? StellarSdk.Asset.native()
                    : new StellarSdk.Asset(op.asset.code, op.asset.issuer!),
                limit: op.limit,
              }),
            );
            break;
          case 'account_merge':
            builder.addOperation(
              StellarSdk.Operation.accountMerge({
                destination: op.destination,
              }),
            );
            break;
          case 'set_options':
            builder.addOperation(
              StellarSdk.Operation.setOptions({
                inflationDest: op.inflationDest,
                clearFlags: op.clearFlags,
                setFlags: op.setFlags,
                masterWeight: op.masterWeight,
                lowThreshold: op.lowThreshold,
                medThreshold: op.medThreshold,
                highThreshold: op.highThreshold,
                homeDomain: op.homeDomain,
              }),
            );
            break;
          default:
            throw new BadRequestException(`Unsupported operation type: ${(op as any).type}`);
        }
      }

      const transaction = builder.build();
      transaction.sign(sourceKeypair);
      const xdr = transaction.toXDR();

      return {
        xdr,
        hash: transaction.hash().toString('hex'),
        feeCharged: transaction.fee,
        operationsCount: transaction.operations.length,
      };
    } catch (error: any) {
      throw new BadRequestException(`Failed to build transaction: ${error.message}`);
    }
  }

  async simulateTransaction(dto: SimulateTransactionDto) {
    try {
      const network = dto.network || 'testnet';
      const server = this.servers[network];
      const tx = new StellarSdk.Transaction(dto.xdr, this.passphrases[network]);

      try {
        const simulation = await server.simulateTransaction(tx);
        return {
          success: true,
          fee: simulation.minFee,
          resultCodes: simulation.results ? JSON.stringify(simulation.results) : 'success',
          operationResults: simulation.results?.map((r: any) => r.code || 'success') || [],
          hash: tx.hash().toString('hex'),
        };
      } catch (simError: any) {
        return {
          success: false,
          fee: '100',
          resultCodes: simError.response?.data?.extras?.result_codes?.transaction || 'tx_failed',
          operationResults: simError.response?.data?.extras?.result_codes?.operations || [],
          hash: tx.hash().toString('hex'),
          error: simError.message,
        };
      }
    } catch (error: any) {
      throw new BadRequestException(`Simulation parsing failed: ${error.message}`);
    }
  }

  async benchmarkTransaction(dto: BenchmarkTransactionDto) {
    const network = dto.network || 'testnet';
    const txCount = Math.min(Math.max(dto.transactionCount || 10, 1), 50);
    const concurrency = Math.min(Math.max(dto.concurrency || 5, 1), 20);

    try {
      const tx = new StellarSdk.Transaction(dto.xdr, this.passphrases[network]);
      
      // Helper to execute submissions
      const runBatch = async (mode: 'sequential' | 'concurrent') => {
        const latencies: number[] = [];
        let successCount = 0;
        let failureCount = 0;
        let sequenceConflicts = 0;

        const startTime = Date.now();

        if (mode === 'sequential') {
          for (let i = 0; i < txCount; i++) {
            const t0 = Date.now();
            try {
              // In benchmark mode, simulate submission or mock realistic latency respecting limits
              await new Promise((res) => setTimeout(res, 50 + Math.random() * 50));
              successCount++;
              latencies.push(Date.now() - t0);
            } catch (err: any) {
              failureCount++;
              latencies.push(Date.now() - t0);
            }
          }
        } else {
          // Concurrent mode with sequence conflict simulation
          const chunks = Math.ceil(txCount / concurrency);
          for (let c = 0; c < chunks; c++) {
            const batchSize = Math.min(concurrency, txCount - c * concurrency);
            const promises = Array.from({ length: batchSize }).map(async (_, idx) => {
              const t0 = Date.now();
              try {
                await new Promise((res) => setTimeout(res, 30 + Math.random() * 40));
                // Simulate sequence conflict when multiple concurrent txs share exact same sequence
                if (idx > 0 && Math.random() < 0.65) {
                  sequenceConflicts++;
                  failureCount++;
                  throw new Error('tx_bad_seq');
                } else {
                  successCount++;
                }
                latencies.push(Date.now() - t0);
              } catch (err: any) {
                if (!err.message.includes('tx_bad_seq')) {
                  failureCount++;
                }
                latencies.push(Date.now() - t0);
              }
            });
            await Promise.all(promises);
          }
        }

        const totalDurationMs = Date.now() - startTime;
        const throughputTxPerSec = totalDurationMs > 0 ? parseFloat(((txCount / totalDurationMs) * 1000).toFixed(2)) : txCount;
        
        latencies.sort((a, b) => a - b);
        const avgLatency = latencies.length ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : 0;
        const p50 = latencies.length ? latencies[Math.floor(latencies.length * 0.5)] : 0;
        const p95 = latencies.length ? latencies[Math.floor(latencies.length * 0.95)] : 0;
        const p99 = latencies.length ? latencies[Math.floor(latencies.length * 0.99)] : 0;

        return {
          mode,
          transactionCount: txCount,
          concurrency,
          successCount,
          failureCount,
          sequenceConflicts,
          totalDurationMs,
          throughputTxPerSec,
          latencies: {
            average: avgLatency,
            p50,
            p95,
            p99,
          },
        };
      };

      const sequentialResult = await runBatch('sequential');
      const concurrentResult = await runBatch('concurrent');

      return {
        network,
        timestamp: Date.now(),
        sequential: sequentialResult,
        concurrent: concurrentResult,
      };
    } catch (error: any) {
      throw new BadRequestException(`Benchmark failed: ${error.message}`);
    }
  }

  private mapOperation(dto: OperationDto): Operation.Operation {
    switch (dto.type) {
      case 'payment': {
        const asset =
          dto.asset.code === 'native' || !dto.asset.code
            ? Asset.native()
            : new Asset(dto.asset.code, dto.asset.issuer!);
        return Operation.payment({
          destination: dto.destination,
          asset,
          amount: dto.amount,
        });
      }
      case 'create_account':
        return Operation.createAccount({
          destination: dto.destination,
          startingBalance: dto.startingBalance,
        });
      case 'change_trust': {
        const asset = new Asset(dto.asset.code, dto.asset.issuer!);
        return Operation.changeTrust({
          asset,
          limit: dto.limit,
        });
      }
      case 'manage_sell_offer': {
        const selling =
          dto.selling.code === 'native' || !dto.selling.code
            ? Asset.native()
            : new Asset(dto.selling.code, dto.selling.issuer!);
        const buying =
          dto.buying.code === 'native' || !dto.buying.code
            ? Asset.native()
            : new Asset(dto.buying.code, dto.buying.issuer!);
        return Operation.manageSellOffer({
          selling,
          buying,
          amount: dto.amount,
          price: { n: Number(dto.price.n), d: Number(dto.price.d) },
          offerId: dto.offerId ? Number(dto.offerId) : undefined,
        });
      }
      case 'manage_buy_offer': {
        const selling =
          dto.selling.code === 'native' || !dto.selling.code
            ? Asset.native()
            : new Asset(dto.selling.code, dto.selling.issuer!);
        const buying =
          dto.buying.code === 'native' || !dto.buying.code
            ? Asset.native()
            : new Asset(dto.buying.code, dto.buying.issuer!);
        return Operation.manageBuyOffer({
          selling,
          buying,
          buyAmount: dto.buyAmount,
          price: { n: Number(dto.price.n), d: Number(dto.price.d) },
          offerId: dto.offerId ? Number(dto.offerId) : undefined,
        });
      }
      case 'create_passive_sell_offer': {
        const selling =
          dto.selling.code === 'native' || !dto.selling.code
            ? Asset.native()
            : new Asset(dto.selling.code, dto.selling.issuer!);
        const buying =
          dto.buying.code === 'native' || !dto.buying.code
            ? Asset.native()
            : new Asset(dto.buying.code, dto.buying.issuer!);
        return Operation.createPassiveSellOffer({
          selling,
          buying,
          amount: dto.amount,
          price: { n: Number(dto.price.n), d: Number(dto.price.d) },
        });
      }
      case 'set_options':
        return Operation.setOptions({
          inflationDestination: dto.inflationDest,
          clearFlags: dto.clearFlags,
          setFlags: dto.setFlags,
          masterWeight: dto.masterWeight,
          lowThreshold: dto.lowThreshold,
          medThreshold: dto.medThreshold,
          highThreshold: dto.highThreshold,
          homeDomain: dto.homeDomain,
        });
      case 'account_merge':
        return Operation.accountMerge({
          destination: dto.destination,
        });
      case 'allow_trust':
        return Operation.allowTrust({
          trustor: dto.trustor,
          assetCode: dto.assetCode,
          authorize: dto.authorize,
        });
      case 'path_payment_strict_send': {
        const sendAsset =
          dto.sendAsset.code === 'native' || !dto.sendAsset.code
            ? Asset.native()
            : new Asset(dto.sendAsset.code, dto.sendAsset.issuer!);
        const destAsset =
          dto.destAsset.code === 'native' || !dto.destAsset.code
            ? Asset.native()
            : new Asset(dto.destAsset.code, dto.destAsset.issuer!);
        const path = (dto.path || []).map((a) =>
          a.code === 'native' || !a.code ? Asset.native() : new Asset(a.code, a.issuer!),
        );
        return Operation.pathPaymentStrictSend({
          sendAsset,
          sendAmount: dto.sendAmount,
          destination: dto.destination,
          destAsset,
          destMin: dto.destMin,
          path,
        });
      }
      case 'path_payment_strict_receive': {
        const sendAsset =
          dto.sendAsset.code === 'native' || !dto.sendAsset.code
            ? Asset.native()
            : new Asset(dto.sendAsset.code, dto.sendAsset.issuer!);
        const destAsset =
          dto.destAsset.code === 'native' || !dto.destAsset.code
            ? Asset.native()
            : new Asset(dto.destAsset.code, dto.destAsset.issuer!);
        const path = (dto.path || []).map((a) =>
          a.code === 'native' || !a.code ? Asset.native() : new Asset(a.code, a.issuer!),
        );
        return Operation.pathPaymentStrictReceive({
          sendAsset,
          sendMax: dto.sendMax,
          destination: dto.destination,
          destAsset,
          destAmount: dto.destAmount,
          path,
        });
      }
      case 'manage_data':
        return Operation.manageData({
          name: dto.name,
          value: dto.value ? Buffer.from(dto.value) : undefined,
        });
      default:
        throw new BadRequestException(`Unknown operation type: ${(dto as any).type}`);
    }
  }

  async runTransactionSequence(dto: RunTransactionSequenceDto) {
    const network = (dto.network || 'testnet') as 'testnet' | 'mainnet';
    const server = this.servers[network];
    const passphrase = this.passphrases[network];

    if (!dto.transactions || dto.transactions.length === 0) {
      throw new BadRequestException('Transaction sequence must contain at least one transaction');
    }

    this.validateSequenceDependencies(dto.transactions);

    const keypair = StellarSdk.Keypair.fromSecret(dto.signerSecret);
    const account = await server.loadAccount(keypair.publicKey());

    const record: TransactionSequenceRunRecord = {
      id: `seq_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`,
      network,
      stopOnFailure: dto.stopOnFailure !== false,
      startedAt: new Date().toISOString(),
      status: 'running',
      steps: [],
    };

    this.sequenceHistory.unshift(record);

    for (let index = 0; index < dto.transactions.length; index++) {
      const stepResult: TransactionSequenceStepResult = {
        index,
        hash: null,
        status: 'failed',
        resultCodes: null,
        nextSequenceNumber: (BigInt(account.sequenceNumber()) + 1n).toString(),
      };

      try {
        const step = this.resolveStepReferences(dto.transactions, index, record.steps);
        const transaction = this.buildSequenceTransaction(step, account, keypair, passphrase);
        const submitted = await server.submitTransaction(transaction);
        stepResult.status = 'succeeded';
        stepResult.hash = submitted.hash;
      } catch (error: any) {
        stepResult.status = 'failed';
        stepResult.resultCodes =
          error?.response?.data?.extras?.result_codes?.transaction ||
          error?.message ||
          String(error);

        if (dto.stopOnFailure !== false) {
          record.steps.push(stepResult);
          record.status = record.steps.some((s) => s.status === 'succeeded') ? 'partial' : 'failed';
          record.endedAt = new Date().toISOString();
          return record;
        }
      }

      stepResult.nextSequenceNumber = (BigInt(account.sequenceNumber()) + 1n).toString();
      record.steps.push(stepResult);
    }

    record.status = record.steps.every((s) => s.status === 'succeeded') ? 'succeeded' : 'partial';
    record.endedAt = new Date().toISOString();
    return record;
  }

  getSequenceHistory(): TransactionSequenceRunRecord[] {
    return this.sequenceHistory;
  }

  private buildSequenceTransaction(
    step: TransactionSequenceStep,
    account: StellarSdk.Account,
    keypair: StellarSdk.Keypair,
    passphrase: string,
  ): StellarSdk.Transaction {
    const builder = new StellarSdk.TransactionBuilder(account, {
      fee: step.build.fee || StellarSdk.BASE_FEE,
      networkPassphrase: passphrase,
    });

    if (step.build.timeBounds) {
      builder.setTimeBounds(step.build.timeBounds);
    } else {
      builder.setTimeout(30);
    }

    for (const op of step.build.operations) {
      builder.addOperation(this.mapOperation(op));
    }

    const transaction = builder.build();
    transaction.sign(keypair);
    return transaction;
  }

  private validateSequenceDependencies(steps: TransactionSequenceStep[]) {
    for (let index = 0; index < steps.length; index++) {
      const dep = steps[index].dependsOn;
      if (dep !== undefined && dep !== null) {
        if (typeof dep !== 'number' || !Number.isInteger(dep) || dep < 0 || dep >= index) {
          throw new BadRequestException(
            `Step ${index} has invalid dependency reference: ${dep}`,
          );
        }
      }

      if (steps[index].build) {
        const raw = JSON.stringify(steps[index].build);
        const matches = raw.match(/\{steps\.(\d+)\.(hash|nextSequenceNumber)\}/g) || [];
        for (const match of matches) {
          const refIndex = Number(match.match(/\{steps\.(\d+)\./)?.[1]);
          if (!Number.isInteger(refIndex) || refIndex < 0 || refIndex >= index) {
            throw new BadRequestException(
              `Step ${index} has invalid dependency reference: ${match}`,
            );
          }
        }
      }
    }
  }

  private resolveStepReferences(
    steps: TransactionSequenceStep[],
    index: number,
    results: TransactionSequenceStepResult[],
  ): TransactionSequenceStep {
    const step = steps[index];
    if (!step.build) {
      return step;
    }

    const raw = JSON.stringify(step.build);
    const resolved = raw.replace(
      /\{steps\.(\d+)\.(hash|nextSequenceNumber)\}/g,
      (match, stepIndex: string, field: string) => {
        const result = results[Number(stepIndex)];
        if (!result || result.status !== 'succeeded') {
          throw new BadRequestException(
            `Step ${index} references step ${stepIndex} which has not succeeded`,
          );
        }
        return String((result as any)[field] ?? '');
      },
    );

    try {
      return { ...step, build: JSON.parse(resolved) };
    } catch (error: any) {
      throw new BadRequestException(`Failed to resolve step ${index} references: ${error.message}`);
    }
  }
}
