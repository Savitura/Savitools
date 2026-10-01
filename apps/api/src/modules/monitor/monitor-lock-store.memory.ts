import { MonitorLockStore } from './monitor-leader.service';

interface Lease {
  token: string;
  expiresAt: number;
}

/**
 * In-process implementation of {@link MonitorLockStore} mirroring the Redis
 * semantics a single process would see (`SET NX` acquire, owner-only renew and
 * release, TTL expiry).
 *
 * It exists so the multi-instance acceptance test
 * (`monitor-multi-instance.spec.ts`) and the in-process mode of
 * `scripts/ledger-monitor-load-test.ts` can model N replicas sharing one Redis
 * without running Redis. Production always uses
 * {@link redisMonitorLockStore}.
 */
export function createInMemoryMonitorLockStore(
  now: () => number = Date.now,
): MonitorLockStore {
  const leases = new Map<string, Lease>();

  const live = (key: string): Lease | undefined => {
    const lease = leases.get(key);
    if (lease && lease.expiresAt <= now()) {
      leases.delete(key);
      return undefined;
    }
    return lease;
  };

  return {
    async acquire(key, token, ttlMs) {
      // `SET key token NX PX ttl`: fails while any live lease exists, including
      // one owned by this caller (the caller renews instead).
      if (live(key)) {
        return false;
      }
      leases.set(key, { token, expiresAt: now() + ttlMs });
      return true;
    },
    async renew(key, token, ttlMs) {
      const lease = live(key);
      if (!lease || lease.token !== token) {
        return false;
      }
      lease.expiresAt = now() + ttlMs;
      return true;
    },
    async release(key, token) {
      const lease = live(key);
      if (lease?.token === token) {
        leases.delete(key);
      }
    },
  };
}
