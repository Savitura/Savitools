import { createInMemoryMonitorLockStore } from './monitor-lock-store.memory';

describe('in-memory monitor lock store', () => {
  let now: number;
  let store: ReturnType<typeof createInMemoryMonitorLockStore>;

  beforeEach(() => {
    now = 1_000_000;
    store = createInMemoryMonitorLockStore(() => now);
  });

  it('grants the lease to one token only and keeps keys independent', async () => {
    await expect(store.acquire('monitor', 'leader-a', 1000)).resolves.toBe(true);
    await expect(store.acquire('monitor', 'leader-a', 1000)).resolves.toBe(false);
    await expect(store.acquire('monitor', 'leader-b', 1000)).resolves.toBe(false);
    await expect(store.acquire('other', 'leader-b', 1000)).resolves.toBe(true);
  });

  it('grants exactly one concurrent acquisition for the same key', async () => {
    const results = await Promise.all([
      store.acquire('monitor', 'leader-a', 1000),
      store.acquire('monitor', 'leader-b', 1000),
      store.acquire('monitor', 'leader-c', 1000),
    ]);

    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it('expires a lease exactly at its expiry instant', async () => {
    await expect(store.acquire('monitor', 'leader-a', 1000)).resolves.toBe(true);

    now += 999;
    await expect(store.renew('monitor', 'leader-a', 1)).resolves.toBe(true);

    now += 1;
    await expect(store.renew('monitor', 'leader-a', 1000)).resolves.toBe(false);
    await expect(store.acquire('monitor', 'leader-b', 1000)).resolves.toBe(true);
  });

  it('allows a zero-TTL lease to be replaced immediately', async () => {
    await expect(store.acquire('monitor', 'leader-a', 0)).resolves.toBe(true);
    await expect(store.renew('monitor', 'leader-a', 1000)).resolves.toBe(false);
    await expect(store.acquire('monitor', 'leader-b', 1000)).resolves.toBe(true);
  });

  it('does not let a non-owner renew or extend a lease', async () => {
    await expect(store.acquire('monitor', 'leader-a', 1000)).resolves.toBe(true);

    now += 900;
    await expect(store.renew('monitor', 'leader-b', 1000)).resolves.toBe(false);

    now += 100;
    await expect(store.renew('monitor', 'leader-a', 1000)).resolves.toBe(false);
    await expect(store.acquire('monitor', 'leader-b', 1000)).resolves.toBe(true);
  });

  it('never creates or resurrects a lease through renew', async () => {
    await expect(store.renew('missing', 'leader-a', 1000)).resolves.toBe(false);
    await expect(store.acquire('monitor', 'leader-a', 1000)).resolves.toBe(true);

    now += 1000;
    await expect(store.renew('monitor', 'leader-a', 1000)).resolves.toBe(false);
    await expect(store.acquire('monitor', 'leader-a', 1000)).resolves.toBe(true);
  });

  it('refuses renewal and release after another leader takes over', async () => {
    await expect(store.acquire('monitor', 'leader-a', 1000)).resolves.toBe(true);
    now += 1000;
    await expect(store.acquire('monitor', 'leader-b', 1000)).resolves.toBe(true);

    await expect(store.renew('monitor', 'leader-a', 1000)).resolves.toBe(false);
    await expect(store.release('monitor', 'leader-a')).resolves.toBeUndefined();
    await expect(store.renew('monitor', 'leader-b', 1000)).resolves.toBe(true);
  });

  it('releases only the owner lease and leaves other keys untouched', async () => {
    await expect(store.acquire('monitor', 'leader-a', 1000)).resolves.toBe(true);
    await expect(store.acquire('other', 'leader-a', 1000)).resolves.toBe(true);

    await expect(store.release('monitor', 'leader-b')).resolves.toBeUndefined();
    await expect(store.acquire('monitor', 'leader-b', 1000)).resolves.toBe(false);

    await expect(store.release('monitor', 'leader-a')).resolves.toBeUndefined();
    await expect(store.acquire('monitor', 'leader-b', 1000)).resolves.toBe(true);
    await expect(store.renew('other', 'leader-a', 1000)).resolves.toBe(true);
  });

  it('resolves release for missing and expired leases', async () => {
    await expect(store.release('missing', 'leader-a')).resolves.toBeUndefined();

    await expect(store.acquire('monitor', 'leader-a', 1000)).resolves.toBe(true);
    now += 1000;
    await expect(store.release('monitor', 'leader-a')).resolves.toBeUndefined();
  });
});
