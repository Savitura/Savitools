import {
  BadRequestException,
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
  Optional,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import * as StellarSdk from "@stellar/stellar-sdk";
import { Between, LessThan, Repository } from "typeorm";
import { MetricsService } from "../metrics/metrics.service";
import { NetworkSample } from "./entities/network-sample.entity";

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

export interface NetworkHistoryBucket {
  timestamp: number;
  sampledAt: string;
  ok: boolean;
  latencyMs: number | null;
  sampleCount: number;
  errorCount: number;
}

export interface NetworkHistorySummary {
  uptimePercent: number;
  p50LatencyMs: number | null;
  p95LatencyMs: number | null;
  outageCount: number;
  sampleCount: number;
}

export interface NetworkHistoryResponse {
  network: "mainnet" | "testnet";
  from: string;
  to: string;
  bucketSeconds: number;
  summary: NetworkHistorySummary;
  samples: NetworkHistoryBucket[];
}

@Injectable()
export class NetworkService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NetworkService.name);
  private pollInterval: NodeJS.Timeout;
  private pollInProgress = false;

  private readonly passphrases = {
    mainnet: StellarSdk.Networks.PUBLIC,
    testnet: StellarSdk.Networks.TESTNET,
  };

  constructor(
    private configService: ConfigService,
    @InjectRepository(NetworkSample)
    private readonly sampleRepository: Repository<NetworkSample>,
    @Optional() private readonly metricsService?: MetricsService,
  ) {
    this.metricsService?.setHorizonConnections("mainnet", 1);
    this.metricsService?.setHorizonConnections("testnet", 1);
  }

  async onModuleInit() {
    await this.pollAndStore();

    this.pollInterval = setInterval(() => this.pollAndStore(), 60000);
  }

  async onModuleDestroy() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
    }
  }

  async fetchCurrentStatus(
    network: "mainnet" | "testnet",
  ): Promise<NetworkStatus> {
    const server = new StellarSdk.Horizon.Server(this.horizonUrl(network));
    const start = Date.now();

    try {
      const [latestLedgersPage, feeStats] = await Promise.all([
        server.ledgers().order("desc").limit(10).call(),
        server.feeStats(),
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
          },
        },
        latency,
      };
    } catch (error) {
      this.logger.error(`Error fetching status for ${network}`, error);
      throw error;
    }
  }

  async pollAndStore() {
    if (this.pollInProgress) {
      this.logger.warn(
        "Skipping network status poll because one is still running",
      );
      return;
    }

    this.pollInProgress = true;
    try {
      await Promise.allSettled(
        (["mainnet", "testnet"] as const).map((network) =>
          this.sampleNetwork(network),
        ),
      );
      await this.pruneRetention();
    } catch (error) {
      this.logger.error("Error during network status polling", error);
    } finally {
      this.pollInProgress = false;
    }
  }

  async getHistory(
    network: "mainnet" | "testnet",
    from?: string,
    to?: string,
  ): Promise<NetworkHistoryResponse> {
    const range = this.parseHistoryRange(from, to);
    const samples = await this.sampleRepository.find({
      where: {
        network,
        sampledAt: Between(range.from, range.to),
      },
      order: { sampledAt: "ASC" },
    });

    const buckets = this.bucketSamples(samples);

    return {
      network,
      from: range.from.toISOString(),
      to: range.to.toISOString(),
      bucketSeconds: 60,
      summary: this.summarizeBuckets(buckets),
      samples: buckets,
    };
  }

  async pruneRetention(now = new Date()) {
    const cutoff = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    await this.sampleRepository.delete({ sampledAt: LessThan(cutoff) });
  }

  private async sampleNetwork(network: "mainnet" | "testnet") {
    const horizonBaseUrl = this.horizonUrl(network);
    const startedAt = Date.now();

    try {
      await this.fetchCurrentStatus(network);
      await this.sampleRepository.save(
        this.sampleRepository.create({
          network,
          horizonBaseUrl,
          ok: true,
          latencyMs: Date.now() - startedAt,
          error: null,
          sampledAt: new Date(),
        }),
      );
    } catch (error) {
      await this.sampleRepository.save(
        this.sampleRepository.create({
          network,
          horizonBaseUrl,
          ok: false,
          latencyMs: Date.now() - startedAt,
          error: this.errorMessage(error),
          sampledAt: new Date(),
        }),
      );
      this.logger.warn(
        `Stored failed network status sample for ${network}: ${this.errorMessage(error)}`,
      );
    }
  }

  private horizonUrl(network: "mainnet" | "testnet") {
    return network === "mainnet"
      ? this.configService.get<string>(
          "STELLAR_HORIZON_MAINNET_URL",
          "https://horizon.stellar.org",
        )
      : this.configService.get<string>(
          "STELLAR_HORIZON_URL",
          "https://horizon-testnet.stellar.org",
        );
  }

  private parseHistoryRange(from?: string, to?: string) {
    const now = new Date();
    const parsedTo = to ? new Date(to) : now;
    const parsedFrom = from
      ? new Date(from)
      : new Date(parsedTo.getTime() - 60 * 60 * 1000);

    if (
      Number.isNaN(parsedFrom.getTime()) ||
      Number.isNaN(parsedTo.getTime())
    ) {
      throw new BadRequestException("from and to must be valid ISO dates");
    }

    if (parsedFrom > parsedTo) {
      throw new BadRequestException("from must be before to");
    }

    if (parsedTo.getTime() - parsedFrom.getTime() > 90 * 24 * 60 * 60 * 1000) {
      throw new BadRequestException("history range cannot exceed 90 days");
    }

    return { from: parsedFrom, to: parsedTo };
  }

  private bucketSamples(samples: NetworkSample[]): NetworkHistoryBucket[] {
    const grouped = new Map<number, NetworkSample[]>();

    for (const sample of samples) {
      const bucket = Math.floor(sample.sampledAt.getTime() / 60000) * 60000;
      grouped.set(bucket, [...(grouped.get(bucket) ?? []), sample]);
    }

    return [...grouped.entries()].map(([timestamp, bucketSamples]) => {
      const okCount = bucketSamples.filter((sample) => sample.ok).length;
      const latencySamples = bucketSamples
        .map((sample) => sample.latencyMs)
        .filter((latency): latency is number => latency !== null);
      const avgLatency =
        latencySamples.length > 0
          ? Math.round(
              latencySamples.reduce((sum, latency) => sum + latency, 0) /
                latencySamples.length,
            )
          : null;

      return {
        timestamp,
        sampledAt: new Date(timestamp).toISOString(),
        ok: okCount >= bucketSamples.length / 2,
        latencyMs: avgLatency,
        sampleCount: bucketSamples.length,
        errorCount: bucketSamples.length - okCount,
      };
    });
  }

  private summarizeBuckets(
    buckets: NetworkHistoryBucket[],
  ): NetworkHistorySummary {
    if (buckets.length === 0) {
      return {
        uptimePercent: 0,
        p50LatencyMs: null,
        p95LatencyMs: null,
        outageCount: 0,
        sampleCount: 0,
      };
    }

    const upBuckets = buckets.filter((bucket) => bucket.ok).length;
    const latencies = buckets
      .map((bucket) => bucket.latencyMs)
      .filter((latency): latency is number => latency !== null)
      .sort((a, b) => a - b);

    return {
      uptimePercent: Number(((upBuckets / buckets.length) * 100).toFixed(2)),
      p50LatencyMs: this.percentile(latencies, 0.5),
      p95LatencyMs: this.percentile(latencies, 0.95),
      outageCount: this.countOutages(buckets),
      sampleCount: buckets.reduce((sum, bucket) => sum + bucket.sampleCount, 0),
    };
  }

  private percentile(values: number[], percentile: number) {
    if (values.length === 0) return null;
    const index = Math.ceil(values.length * percentile) - 1;
    return values[Math.max(0, Math.min(index, values.length - 1))];
  }

  private countOutages(buckets: NetworkHistoryBucket[]) {
    let outages = 0;
    let wasDown = false;

    for (const bucket of buckets) {
      if (!bucket.ok && !wasDown) outages += 1;
      wasDown = !bucket.ok;
    }

    return outages;
  }

  private errorMessage(error: unknown) {
    return error instanceof Error ? error.message : String(error);
  }
}
