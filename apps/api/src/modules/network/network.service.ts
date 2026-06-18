import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as StellarSdk from '@stellar/stellar-sdk';
import { createClient, RedisClientType } from 'redis';

export interface NetworkStatus {
  timestamp: number;
  network: string;
  passphrase: string;
  ledger: {
    sequence: number;
    closeTime: string;
    secondsSinceClose: number;
    avgCloseTime: number;
  };
  fees: {
    baseFee: {
      min: number;
      mode: number;
      max: number;
    };
    percentiles: {
      p10: number;
      p50: number;
      p90: number;
      p99: number;
    };
  };
  latency: number;
}

@Injectable()
export class NetworkService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NetworkService.name);
  private redisClient: RedisClientType;
  private pollInterval: NodeJS.Timeout;

  private readonly servers = {
    mainnet: new StellarSdk.Horizon.Server('https://horizon.stellar.org'),
    testnet: new StellarSdk.Horizon.Server('https://horizon-testnet.stellar.org'),
  };

  private readonly passphrases = {
    mainnet: StellarSdk.Networks.PUBLIC,
    testnet: StellarSdk.Networks.TESTNET,
  };

  constructor(private configService: ConfigService) {}

  async onModuleInit() {
    const redisUrl = this.configService.get<string>('REDIS_URL') || 'redis://localhost:6379';
    this.redisClient = createClient({ url: redisUrl });
    
    this.redisClient.on('error', (err) => this.logger.error('Redis Client Error', err));
    
    try {
      await this.redisClient.connect();
      this.logger.log('Connected to Redis for Network status polling');
      
      // Initial poll
      await this.pollAndStore();
      
      // Poll every 60 seconds
      this.pollInterval = setInterval(() => this.pollAndStore(), 60000);
    } catch (err) {
      this.logger.error('Failed to connect to Redis', err);
    }
  }

  async onModuleDestroy() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
    }
    if (this.redisClient) {
      await this.redisClient.quit();
    }
  }

  async fetchCurrentStatus(network: 'mainnet' | 'testnet'): Promise<NetworkStatus> {
    const server = this.servers[network];
    const start = Date.now();
    
    try {
      const [latestLedgersPage, feeStats] = await Promise.all([
        server.ledgers().order('desc').limit(10).call(),
        server.feeStats()
      ]);
      
      const latency = Date.now() - start;
      const ledgers = latestLedgersPage.records;
      const latestLedger = ledgers[0];
      const closeTime = new Date(latestLedger.closed_at).getTime();
      const secondsSinceClose = Math.floor((Date.now() - closeTime) / 1000);
      
      // Calculate average close time over last 10 ledgers
      let avgCloseTime = 0;
      if (ledgers.length > 1) {
        const oldestLedger = ledgers[ledgers.length - 1];
        const oldestTime = new Date(oldestLedger.closed_at).getTime();
        avgCloseTime = (closeTime - oldestTime) / 1000 / (ledgers.length - 1);
      }

      return {
        timestamp: Date.now(),
        network,
        passphrase: this.passphrases[network],
        ledger: {
          sequence: latestLedger.sequence,
          closeTime: latestLedger.closed_at,
          secondsSinceClose,
          avgCloseTime: parseFloat(avgCloseTime.toFixed(2)),
        },
        fees: {
          baseFee: {
            min: parseInt(feeStats.fee_charged.min),
            mode: parseInt(feeStats.fee_charged.mode),
            max: parseInt(feeStats.fee_charged.max),
          },
          percentiles: {
            p10: parseInt(feeStats.fee_charged.p10),
            p50: parseInt(feeStats.fee_charged.p50),
            p90: parseInt(feeStats.fee_charged.p90),
            p99: parseInt(feeStats.fee_charged.p99),
          }
        },
        latency,
      };
    } catch (error) {
      this.logger.error(`Error fetching status for ${network}`, error);
      throw error;
    }
  }

  async pollAndStore() {
    try {
      for (const network of ['mainnet', 'testnet'] as const) {
        const status = await this.fetchCurrentStatus(network);
        const redisKey = `network_history:${network}`;
        
        // Add to the front of the list
        await this.redisClient.lPush(redisKey, JSON.stringify(status));
        
        // Keep only the last 60 entries
        await this.redisClient.lTrim(redisKey, 0, 59);
      }
    } catch (error) {
      this.logger.error('Error during pollAndStore', error);
    }
  }

  async getHistory(network: 'mainnet' | 'testnet'): Promise<NetworkStatus[]> {
    try {
      const redisKey = `network_history:${network}`;
      const results = await this.redisClient.lRange(redisKey, 0, -1);
      // Data was prepended (latest first), reverse it so it's oldest to newest for charts
      return results.map((r) => JSON.parse(r)).reverse();
    } catch (error) {
      this.logger.error(`Error fetching history for ${network}`, error);
      return [];
    }
  }
}
