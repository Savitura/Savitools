import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  type Provider,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { createClient } from 'redis';
import { MonitorRuntimeConfig } from './monitor-runtime.config';

/**
 * Single active monitor producer (Savitura/Savitools#255).
 *
 * Horizon streams, state evaluation and pending-alert dispatch must run in
 * exactly one place, otherwise N replicas open N sets of Horizon connections
 * and evaluate the same threshold crossing N times — which writes duplicate
 * `alert_events` rows (state alerts have a NULL `watch_event_id`, so the unique
 * index does not catch them) and delivers duplicate notifications.
 *
 * Leadership is a Redis lease: `SET <key> <token> NX PX <ttl>` to acquire and a
 * Lua compare-and-expire to renew, so a leader that dies (or is paused) loses
 * the lease after at most `MONITOR_LEADER_LEASE_MS` and another replica takes
 * over on its next tick. Renewals only succeed when the caller still owns the
 * token, so a partitioned replica can never believe it is the leader while
 * somebody else is renewing.
 */

export const MONITOR_LOCK_STORE = Symbol('MONITOR_LOCK_STORE');

export interface MonitorLockStore {
  /** True when the caller now owns the lease. */
  acquire(key: string, token: string, ttlMs: number): Promise<boolean>;
  /** True when the caller still owned the lease and it was extended. */
  renew(key: string, token: string, ttlMs: number): Promise<boolean>;
  /** Best-effort release; only removes the lease owned by `token`. */
  release(key: string, token: string): Promise<void>;
}

const RENEW_SCRIPT = `
if redis.call('get', KEYS[1]) == ARGV[1] then
  return redis.call('pexpire', KEYS[1], ARGV[2])
end
return 0
`;

const RELEASE_SCRIPT = `
if redis.call('get', KEYS[1]) == ARGV[1] then
  return redis.call('del', KEYS[1])
end
return 0
`;

export interface RedisMonitorLockStore extends MonitorLockStore {
  close(): Promise<void>;
}

/**
 * Redis-backed lease store (node-redis). The client connects lazily, so a
 * process that never becomes a producer (`MONITOR_ROLE=api`) never opens a
 * connection.
 */
export function redisMonitorLockStore(redisUrl: string): RedisMonitorLockStore {
  const logger = new Logger('MonitorLockStore');
  const client = createClient({ url: redisUrl });
  client.on('error', (error: Error) => {
    logger.error(`Monitor leader Redis error: ${error.message}`);
  });

  const connect = async (): Promise<void> => {
    if (!client.isOpen) {
      await client.connect();
    }
  };

  return {
    async acquire(key, token, ttlMs) {
      await connect();
      const result = await client.set(key, token, { NX: true, PX: ttlMs });
      return result === 'OK';
    },
    async renew(key, token, ttlMs) {
      await connect();
      const result = await client.eval(RENEW_SCRIPT, {
        keys: [key],
        arguments: [token, String(ttlMs)],
      });
      return Number(result) === 1;
    },
    async release(key, token) {
      if (!client.isOpen) {
        return;
      }
      await client.eval(RELEASE_SCRIPT, {
        keys: [key],
        arguments: [token],
      });
    },
    async close() {
      if (client.isOpen) {
        await client.quit();
      }
    },
  };
}

export const monitorLockStoreProvider: Provider = {
  provide: MONITOR_LOCK_STORE,
  inject: [ConfigService],
  useFactory: (configService: ConfigService): RedisMonitorLockStore =>
    redisMonitorLockStore(
      configService.get<string>('REDIS_URL') ?? 'redis://localhost:6379',
    ),
};

export type LeadershipListener = (isLeader: boolean) => void;

@Injectable()
export class MonitorLeaderService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MonitorLeaderService.name);
  /** Identifies this process in the lease so it can never steal its own. */
  readonly instanceId = randomUUID();
  private readonly listeners = new Set<LeadershipListener>();
  private leader = false;
  private ticking = false;
  private stopping = false;
  private timer?: ReturnType<typeof setInterval>;

  constructor(
    private readonly runtime: MonitorRuntimeConfig,
    @Inject(MONITOR_LOCK_STORE)
    private readonly lockStore: MonitorLockStore,
  ) {}

  /** True when this process is allowed to run the producer at all. */
  get producerEnabled(): boolean {
    return this.runtime.producerEnabled;
  }

  isLeader(): boolean {
    return this.leader;
  }

  async onModuleInit(): Promise<void> {
    if (!this.runtime.producerEnabled) {
      this.logger.log(
        `Monitor role "${this.runtime.role}": alert production is disabled on this instance`,
      );
      return;
    }

    // The first attempt is awaited so leadership is already decided when the
    // dependent services run their own onApplicationBootstrap hooks.
    await this.tick();
    this.timer = setInterval(
      () => {
        void this.tick();
      },
      Math.max(1_000, Math.floor(this.runtime.leaderLeaseMs / 3)),
    );
    // Never keep the event loop alive just to renew a lease.
    this.timer.unref?.();
  }

  async onModuleDestroy(): Promise<void> {
    this.stopping = true;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
    if (this.leader) {
      this.setLeadership(false, 'shutting down');
      try {
        await this.lockStore.release(
          this.runtime.leaderLockKey,
          this.instanceId,
        );
      } catch (error) {
        this.logger.warn(
          `Failed to release the monitor leader lease: ${this.errorMessage(error)}`,
        );
      }
    }
    const store = this.lockStore as Partial<RedisMonitorLockStore>;
    if (typeof store.close === 'function') {
      await store.close();
    }
  }

  /**
   * Registers a listener and immediately reports the current leadership, so a
   * service bootstrapped while another replica leads is not left waiting for a
   * transition that may never come.
   */
  onLeadershipChange(listener: LeadershipListener): () => void {
    this.listeners.add(listener);
    listener(this.leader);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private async tick(): Promise<void> {
    if (this.ticking || this.stopping) {
      return;
    }
    this.ticking = true;
    try {
      const { leaderLockKey, leaderLeaseMs } = this.runtime;
      // Acquiring first keeps the common "leader renews" path a single call;
      // renewing after a failed acquire covers a lease this process already
      // owns (for example after a transient Redis error dropped our view of
      // it) without waiting for the lease to expire.
      const held =
        (await this.lockStore.acquire(
          leaderLockKey,
          this.instanceId,
          leaderLeaseMs,
        )) ||
        (await this.lockStore.renew(
          leaderLockKey,
          this.instanceId,
          leaderLeaseMs,
        ));
      this.setLeadership(held, held ? 'lease held' : 'another replica leads');
    } catch (error) {
      // Fail safe: without a confirmed lease we must stop producing, or two
      // replicas could evaluate the same crossing.
      this.setLeadership(
        false,
        `leader election failed: ${this.errorMessage(error)}`,
      );
    } finally {
      this.ticking = false;
    }
  }

  private setLeadership(next: boolean, reason: string): void {
    if (next === this.leader) {
      return;
    }
    this.leader = next;
    if (next) {
      this.logger.log(
        `Monitor producer active on ${this.instanceId} (${reason})`,
      );
    } else {
      this.logger.warn(`Monitor producer stopped (${reason})`);
    }
    for (const listener of this.listeners) {
      try {
        listener(next);
      } catch (error) {
        this.logger.error(
          `Monitor leadership listener failed: ${this.errorMessage(error)}`,
        );
      }
    }
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
