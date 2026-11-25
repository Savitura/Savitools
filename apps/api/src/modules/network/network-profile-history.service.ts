import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import { NetworkProfileHistory } from './entities/network-profile-history.entity';
import type { RecordConnectivityDto } from './dto/record-connectivity.dto';

export type ConnectivityBucket = 'minute' | 'hour' | 'day';

const BUCKET_SECONDS: Record<ConnectivityBucket, number> = {
  minute: 60,
  hour: 3_600,
  day: 86_400,
};

const DEFAULT_WINDOW_MS = 24 * 60 * 60 * 1000;

export interface ConnectivitySample {
  id: string;
  ok: boolean;
  latencyMs: number | null;
  error: string | null;
  checkedAt: string;
}

export interface ConnectivityTrendBucket {
  timestamp: number;
  checkedAt: string;
  ok: boolean;
  latencyMs: number | null;
  sampleCount: number;
  errorCount: number;
}

export interface ConnectivitySummary {
  uptimePercent: number;
  p50LatencyMs: number | null;
  p95LatencyMs: number | null;
  outageCount: number;
  sampleCount: number;
}

export interface ConnectivityHistory {
  profileId: string;
  from: string;
  to: string;
  bucketSeconds: number;
  samples: ConnectivitySample[];
  trends: ConnectivityTrendBucket[];
  summary: ConnectivitySummary;
}

function parseInstant(value: string | undefined, fallback: Date, field: string): Date {
  if (value === undefined || value.trim() === '') return fallback;

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new BadRequestException(`${field} must be an ISO 8601 date`);
  }
  return parsed;
}

function parseBucket(value: string | undefined): ConnectivityBucket {
  if (value === undefined || value.trim() === '') return 'hour';

  if (value === 'minute' || value === 'hour' || value === 'day') return value;

  throw new BadRequestException('bucket must be one of: minute, hour, day');
}

/** Nearest-rank percentile over an ascending array; `null` for an empty input. */
function percentile(sorted: number[], rank: number): number | null {
  if (sorted.length === 0) return null;

  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(rank * sorted.length) - 1));
  return sorted[index];
}

@Injectable()
export class NetworkProfileHistoryService {
  constructor(
    @InjectRepository(NetworkProfileHistory)
    private readonly historyRepository: Repository<NetworkProfileHistory>,
  ) {}

  async record(
    profileId: string,
    ownerId: string,
    input: RecordConnectivityDto,
  ): Promise<ConnectivitySample> {
    const saved = await this.historyRepository.save(
      this.historyRepository.create({
        profileId,
        ownerId,
        ok: input.ok,
        latencyMs: input.ok ? (input.latencyMs ?? null) : null,
        error: input.ok ? null : (input.error ?? 'probe failed'),
      }),
    );

    return {
      id: saved.id,
      ok: saved.ok,
      latencyMs: saved.latencyMs,
      error: saved.error,
      checkedAt: saved.checkedAt.toISOString(),
    };
  }

  async history(
    profileId: string,
    ownerId: string,
    range: { from?: string; to?: string; bucket?: string } = {},
  ): Promise<ConnectivityHistory> {
    const to = parseInstant(range.to, new Date(), 'to');
    const from = parseInstant(range.from, new Date(to.getTime() - DEFAULT_WINDOW_MS), 'from');
    const bucket = parseBucket(range.bucket);

    if (from.getTime() > to.getTime()) {
      throw new BadRequestException('from must be before to');
    }

    const rows = await this.historyRepository.find({
      where: { profileId, ownerId, checkedAt: Between(from, to) },
      order: { checkedAt: 'ASC' },
    });

    const bucketMs = BUCKET_SECONDS[bucket] * 1000;
    const buckets = new Map<number, NetworkProfileHistory[]>();

    for (const row of rows) {
      const timestamp = Math.floor(row.checkedAt.getTime() / bucketMs) * bucketMs;
      const existing = buckets.get(timestamp);
      if (existing) existing.push(row);
      else buckets.set(timestamp, [row]);
    }

    const trends: ConnectivityTrendBucket[] = [...buckets.entries()]
      .sort(([left], [right]) => left - right)
      .map(([timestamp, samples]) => {
        const latencies = samples
          .map((sample) => sample.latencyMs)
          .filter((latency): latency is number => latency !== null);
        const errorCount = samples.filter((sample) => !sample.ok).length;

        return {
          timestamp,
          checkedAt: new Date(timestamp).toISOString(),
          ok: errorCount === 0,
          latencyMs:
            latencies.length === 0
              ? null
              : Math.round(latencies.reduce((sum, latency) => sum + latency, 0) / latencies.length),
          sampleCount: samples.length,
          errorCount,
        };
      });

    const latencies = rows
      .map((row) => row.latencyMs)
      .filter((latency): latency is number => latency !== null)
      .sort((left, right) => left - right);
    const outageCount = rows.filter((row) => !row.ok).length;

    return {
      profileId,
      from: from.toISOString(),
      to: to.toISOString(),
      bucketSeconds: BUCKET_SECONDS[bucket],
      samples: rows.map((row) => ({
        id: row.id,
        ok: row.ok,
        latencyMs: row.latencyMs,
        error: row.error,
        checkedAt: row.checkedAt.toISOString(),
      })),
      trends,
      summary: {
        uptimePercent: rows.length === 0 ? 0 : ((rows.length - outageCount) / rows.length) * 100,
        p50LatencyMs: percentile(latencies, 0.5),
        p95LatencyMs: percentile(latencies, 0.95),
        outageCount,
        sampleCount: rows.length,
      },
    };
  }
}
