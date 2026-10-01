import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Runtime wiring for the Ledger Monitor (Savitura/Savitools#255).
 *
 * The monitor has two halves — a producer that evaluates watches (Horizon
 * streams, state evaluation and pending-alert dispatch) and a consumer that
 * delivers notifications — and both used to run in every API replica. That
 * multiplied Horizon connections by the replica count and let two replicas
 * evaluate the same threshold crossing, producing duplicate alert rows and
 * duplicate deliveries.
 *
 * Every value below is resolved **once, at startup**, so no code path can
 * silently fall back to a different number than the one the deployment was
 * sized for.
 */

export const MONITOR_ROLES = ['all', 'api', 'worker'] as const;
export type MonitorRole = (typeof MONITOR_ROLES)[number];

/**
 * `all` — one deployment is both producer and consumer (default; safe with N
 *         replicas because the producer is leader-elected and BullMQ hands
 *         each job to exactly one consumer).
 * `api` — HTTP-only replica: never streams, evaluates or consumes.
 * `worker` — dedicated monitor deployment: produces and consumes.
 */
export const DEFAULT_MONITOR_ROLE: MonitorRole = 'all';

/**
 * Cap on simultaneous SSE connections held by one instance: two Horizon
 * streams per account watch (transactions + payments) plus the clients of
 * `GET /monitor/stream`. 50 keeps 25 accounts on live streams and sends the
 * rest to the polling fallback, which is the configuration the recorded load
 * test in docs/ledger-monitor-load-test.md was measured against.
 */
export const DEFAULT_MAX_SSE_CONNECTIONS = 50;

/** How long a leader lease stays valid without a renewal. */
export const DEFAULT_MONITOR_LEADER_LEASE_MS = 30_000;

/** How often balance/transaction-count rules are checked against Horizon. */
export const DEFAULT_MONITOR_EVALUATION_INTERVAL_MS = 60_000;

/** How often alerts stuck in a pending/retrying state are re-enqueued. */
export const DEFAULT_MONITOR_DISPATCH_INTERVAL_MS = 30_000;

/** Redis key holding the monitor leader lease. */
export const MONITOR_LEADER_LOCK_KEY = 'savitools:monitor:leader';

export interface MonitorRoleCapabilities {
  /** This role runs the alert producer (streams, evaluation, dispatch). */
  produces: boolean;
  /** This role consumes notification jobs from the BullMQ queue. */
  consumes: boolean;
}

export function monitorRoleCapabilities(
  role: MonitorRole,
): MonitorRoleCapabilities {
  if (role === 'api') {
    return { produces: false, consumes: false };
  }
  return { produces: true, consumes: true };
}

/** Parses `MONITOR_ROLE`, rejecting typos instead of silently picking one. */
export function resolveMonitorRole(raw: string | undefined): MonitorRole {
  const value = raw?.trim().toLowerCase();
  if (!value) {
    return DEFAULT_MONITOR_ROLE;
  }
  if ((MONITOR_ROLES as readonly string[]).includes(value)) {
    return value as MonitorRole;
  }
  throw new Error(
    `MONITOR_ROLE must be one of ${MONITOR_ROLES.join(', ')} (received "${raw}")`,
  );
}

/** Reads an integer, falling back for unset/invalid input. */
function resolveInteger(
  value: number | string | undefined | null,
  fallback: number,
  minimum: number,
): number {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }
  const parsed =
    typeof value === 'number' ? value : Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) && parsed >= minimum ? parsed : fallback;
}

/** Reads a strictly positive integer (caps, intervals that must tick). */
export function resolvePositiveInteger(
  value: number | string | undefined | null,
  fallback: number,
): number {
  return resolveInteger(value, fallback, 1);
}

/**
 * Reads an interval that may legitimately be `0` to disable the feature
 * (`MONITOR_EVALUATION_INTERVAL_MS=0` turns state alerts off).
 */
export function resolveNonNegativeInteger(
  value: number | string | undefined | null,
  fallback: number,
): number {
  return resolveInteger(value, fallback, 0);
}

@Injectable()
export class MonitorRuntimeConfig {
  readonly role: MonitorRole;
  /** True when this role runs the alert producer at all. */
  readonly producerEnabled: boolean;
  /** True when this role consumes notification jobs. */
  readonly consumerEnabled: boolean;
  readonly maxSseConnections: number;
  readonly leaderLockKey: string;
  readonly leaderLeaseMs: number;
  readonly evaluationIntervalMs: number;
  readonly dispatchIntervalMs: number;

  constructor(configService: ConfigService) {
    this.role = resolveMonitorRole(configService.get<string>('MONITOR_ROLE'));
    const capabilities = monitorRoleCapabilities(this.role);
    this.producerEnabled = capabilities.produces;
    this.consumerEnabled = capabilities.consumes;

    this.maxSseConnections = resolvePositiveInteger(
      configService.get<string>('MAX_SSE_CONNECTIONS'),
      DEFAULT_MAX_SSE_CONNECTIONS,
    );
    this.leaderLockKey =
      configService.get<string>('MONITOR_LEADER_LOCK_KEY')?.trim() ||
      MONITOR_LEADER_LOCK_KEY;
    this.leaderLeaseMs = Math.max(
      1000,
      resolvePositiveInteger(
        configService.get<string>('MONITOR_LEADER_LEASE_MS'),
        DEFAULT_MONITOR_LEADER_LEASE_MS,
      ),
    );
    // 0 is a documented, meaningful value here: it disables state alerts.
    this.evaluationIntervalMs = resolveNonNegativeInteger(
      configService.get<string>('MONITOR_EVALUATION_INTERVAL_MS'),
      DEFAULT_MONITOR_EVALUATION_INTERVAL_MS,
    );
    this.dispatchIntervalMs = resolvePositiveInteger(
      configService.get<string>('MONITOR_DISPATCH_INTERVAL_MS'),
      DEFAULT_MONITOR_DISPATCH_INTERVAL_MS,
    );
  }
}
