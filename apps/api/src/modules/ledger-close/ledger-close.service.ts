import {
  BadRequestException,
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import * as StellarSdk from '@stellar/stellar-sdk';
import { Between, LessThan, Repository } from 'typeorm';
import { LedgerCloseStat } from './entities/ledger-close-stat.entity';
import { LedgerCloseStatsQueryDto } from './dto/ledger-close-stats-query.dto';
import {
  LedgerCloseStatsListResponse,
  LedgerCloseStatsSummary,
} from './dto/ledger-close-stats-response.dto';

const MAX_HISTORY_SAMPLES = 50_000;
const POLL_INTERVAL_MS = 60_000;

@Injectable()
export class LedgerCloseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LedgerCloseService.name);
  private pollInterval: NodeJS.Timeout;
  private pollInProgress = false;

  private readonly passphrases = {
    mainnet: StellarSdk.Networks.PUBLIC,
    testnet: StellarSdk.Networks.TESTNET,
  };

  constructor(
    private configService: ConfigService,
    @InjectRepository(LedgerCloseStat)
    private readonly ledgerCloseStatRepository: Repository<LedgerCloseStat>,
  ) {}

  async onModuleInit() {
    await this.pollAndStore();
    this.pollInterval = setInterval(() => this.pollAndStore(), POLL_INTERVAL_MS);
  }

  async onModuleDestroy() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
    }
  }

  async getStats(
    query: LedgerCloseStatsQueryDto,
  ): Promise<LedgerCloseStatsListResponse> {
    const network = query.network ?? 'mainnet';
    const range = this.parseHistoryRange(query.from, query.to);

    const stats = await this.ledgerCloseStatRepository.find({
      where: {
        network,
        sampledAt: Between(range.from, range.to),
      },
      order: { sampledAt: 'DESC' },
      take: MAX_HISTORY_SAMPLES + 1,
    });

    if (stats.length > MAX_HISTORY_SAMPLES) {
      throw new BadRequestException(
        `History range contains more than ${MAX_HISTORY_SAMPLES} samples; narrow the date range`,
      );
    }

    const summary = this.calculateSummary(stats);

    return {
      stats: stats.map((stat) => this.toResponse(stat)),
      summary,
      network,
      from: range.from.toISOString(),
      to: range.to.toISOString(),
    };
  }

  async pruneRetention(now = new Date()) {
    const cutoff = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    await this.ledgerCloseStatRepository.delete({ sampledAt: LessThan(cutoff) });
  }

  private async pollAndStore() {
    if (this.pollInProgress) {
      this.logger.warn('Skipping ledger close poll because one is still running');
      return;
    }

    this.pollInProgress = true;
    try {
      await Promise.allSettled(
        (['mainnet', 'testnet'] as const).map((network) =>
          this.sampleLedgerClose(network),
        ),
      );
      await this.pruneRetention();
    } catch (error) {
      this.logger.error('Error during ledger close polling', error);
    } finally {
      this.pollInProgress = false;
    }
  }

  private async sampleLedgerClose(network: 'mainnet' | 'testnet') {
    const horizonBaseUrl = this.horizonUrl(network);
    const startedAt = Date.now();

    try {
      const server = new StellarSdk.Horizon.Server(horizonBaseUrl);
      const latestLedgersPage = await server
        .ledgers()
        .order('desc')
        .limit(1)
        .call();

      if (latestLedgersPage.records.length === 0) {
        this.logger.warn(`No ledgers found for ${network}`);
        return;
      }

      const latestLedger = latestLedgersPage.records[0];
      const closeTime = new Date(latestLedger.closed_at).getTime();
      const latencyMs = Date.now() - startedAt;

      const closeTimeSeconds = parseFloat(
        (latestLedger.closing_time / 1000).toFixed(2),
      );

      await this.ledgerCloseStatRepository.save(
        this.ledgerCloseStatRepository.create({
          network,
          ledgerSequence: latestLedger.sequence,
          closeTime: new Date(latestLedger.closed_at),
          closeTimeSeconds,
          latencyMs,
          p50LatencyMs: null,
          p95LatencyMs: null,
          p99LatencyMs: null,
          transactionCount: latestLedger.transaction_count,
          operationCount: latestLedger.operation_count,
          sampledAt: new Date(),
        }),
      );

      this.logger.debug(
        `Recorded ledger close for ${network}: sequence ${latestLedger.sequence}, latency ${latencyMs}ms`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to sample ledger close for ${network}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private horizonUrl(network: 'mainnet' | 'testnet') {
    return network === 'mainnet'
      ? this.configService.get<string>(
          'STELLAR_HORIZON_MAINNET_URL',
          'https://horizon.stellar.org',
        )
      : this.configService.get<string>(
          'STELLAR_HORIZON_URL',
          'https://horizon-testnet.stellar.org',
        );
  }

  private parseHistoryRange(from?: string, to?: string) {
    const now = new Date();
    const parsedTo = to ? new Date(to) : now;
    const parsedFrom = from
      ? new Date(from)
      : new Date(parsedTo.getTime() - 24 * 60 * 60 * 1000);

    if (Number.isNaN(parsedFrom.getTime()) || Number.isNaN(parsedTo.getTime())) {
      throw new BadRequestException('from and to must be valid ISO dates');
    }

    if (parsedFrom > parsedTo) {
      throw new BadRequestException('from must be before to');
    }

    if (parsedTo.getTime() - parsedFrom.getTime() > 90 * 24 * 60 * 60 * 1000) {
      throw new BadRequestException('history range cannot exceed 90 days');
    }

    return { from: parsedFrom, to: parsedTo };
  }

  private calculateSummary(stats: LedgerCloseStat[]): LedgerCloseStatsSummary {
    if (stats.length === 0) {
      return {
        avgCloseTimeSeconds: 0,
        avgLatencyMs: 0,
        p50LatencyMs: 0,
        p95LatencyMs: 0,
        p99LatencyMs: 0,
        totalLedgers: 0,
        totalTransactions: 0,
        totalOperations: 0,
      };
    }

    const closeTimes = stats.map((s) => s.closeTimeSeconds);
    const latencies = stats.map((s) => s.latencyMs).sort((a, b) => a - b);
    const totalTransactions = stats.reduce(
      (sum, s) => sum + (s.transactionCount ?? 0),
      0,
    );
    const totalOperations = stats.reduce(
      (sum, s) => sum + (s.operationCount ?? 0),
      0,
    );

    const avgCloseTimeSeconds =
      closeTimes.reduce((sum, time) => sum + time, 0) / closeTimes.length;
    const avgLatencyMs =
      latencies.reduce((sum, latency) => sum + latency, 0) / latencies.length;

    return {
      avgCloseTimeSeconds: parseFloat(avgCloseTimeSeconds.toFixed(2)),
      avgLatencyMs: Math.round(avgLatencyMs),
      p50LatencyMs: this.percentile(latencies, 0.5),
      p95LatencyMs: this.percentile(latencies, 0.95),
      p99LatencyMs: this.percentile(latencies, 0.99),
      totalLedgers: stats.length,
      totalTransactions,
      totalOperations,
    };
  }

  private percentile(values: number[], percentile: number): number {
    if (values.length === 0) return 0;
    const index = Math.ceil(values.length * percentile) - 1;
    return values[Math.max(0, Math.min(index, values.length - 1))];
  }

  private toResponse(stat: LedgerCloseStat) {
    return {
      id: stat.id,
      network: stat.network,
      ledgerSequence: stat.ledgerSequence,
      closeTime: stat.closeTime.toISOString(),
      closeTimeSeconds: stat.closeTimeSeconds,
      latencyMs: stat.latencyMs,
      p50LatencyMs: stat.p50LatencyMs,
      p95LatencyMs: stat.p95LatencyMs,
      p99LatencyMs: stat.p99LatencyMs,
      transactionCount: stat.transactionCount,
      operationCount: stat.operationCount,
      sampledAt: stat.sampledAt.toISOString(),
    };
  }
}
