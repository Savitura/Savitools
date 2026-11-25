import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { RedisClientType } from 'redis';
import {
  ContractWizardSessionService,
  MAX_WIZARD_SESSIONS,
  MAX_WIZARD_BUFFER_BYTES,
  DEFAULT_WIZARD_SESSION_TTL_MS,
  WIZARD_SESSION_KEY_PREFIX,
  WIZARD_SESSIONS_INDEX_KEY,
  WizardSessionData,
} from './contract-wizard-session.service';
import { RedisProvider } from '../../common/redis.provider';

interface MockRedisMulti {
  set: jest.Mock<MockRedisMulti, [string, string, { EX?: number }?]>;
  del: jest.Mock<MockRedisMulti, [string]>;
  zAdd: jest.Mock<MockRedisMulti, [string, { score: number; value: string }]>;
  zRem: jest.Mock<MockRedisMulti, [string, string]>;
  exec: jest.Mock<Promise<unknown[]>, []>;
}

interface MockRedis {
  get: jest.Mock<Promise<string | null>, [string]>;
  set: jest.Mock<Promise<string>, [string, string, { EX?: number }?]>;
  del: jest.Mock<Promise<number>, [string]>;
  zAdd: jest.Mock<Promise<number>, [string, { score: number; value: string }]>;
  zRem: jest.Mock<Promise<number>, [string, string]>;
  zCard: jest.Mock<Promise<number>, [string]>;
  zRange: jest.Mock<Promise<string[]>, [string, number, number]>;
  zRemRangeByScore: jest.Mock<Promise<number>, [string, number, number]>;
  multi: jest.Mock<MockRedisMulti, []>;
}

describe('ContractWizardSessionService', () => {
  beforeEach(() => {
    ContractWizardSessionService.clearFallbackSessions();
  });

  describe('Local-Development Fallback (Redis not configured)', () => {
    let service: ContractWizardSessionService;

    beforeEach(() => {
      const configService = {
        get: jest.fn((key: string) => (key === 'REDIS_URL' ? undefined : undefined)),
      } as unknown as ConfigService;
      service = new ContractWizardSessionService(configService);
    });

    it('reports Redis as not configured when REDIS_URL is unset', () => {
      expect(service.isRedisConfigured()).toBe(false);
    });

    it('creates and retrieves a wizard session in memory', async () => {
      const token = 'token-123';
      const sampleWasm = Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);
      const session: WizardSessionData = {
        lastStep: 1,
        wasmBuffer: sampleWasm,
        expiresAt: Date.now() + DEFAULT_WIZARD_SESSION_TTL_MS,
      };

      await service.createSession(token, session);

      const retrieved = await service.getSession(token);
      expect(retrieved).toBeDefined();
      expect(retrieved?.lastStep).toBe(1);
      expect(retrieved?.wasmBuffer).toEqual(sampleWasm);
      expect(ContractWizardSessionService.getFallbackSessions().size).toBe(1);
    });

    it('returns null for missing sessions', async () => {
      const retrieved = await service.getSession('non-existent');
      expect(retrieved).toBeNull();
    });

    it('returns null and purges expired sessions upon retrieval', async () => {
      const token = 'expired-token';
      const session: WizardSessionData = {
        lastStep: 1,
        wasmBuffer: Buffer.from('wasm'),
        expiresAt: Date.now() - 1000, // already expired
      };

      await service.createSession(token, session);

      const retrieved = await service.getSession(token);
      expect(retrieved).toBeNull();
      expect(ContractWizardSessionService.getFallbackSessions().has(token)).toBe(false);
    });

    it('cleans up expired non-deploying sessions during cleanExpiredSessions', async () => {
      const now = Date.now();
      await service.createSession('active', {
        lastStep: 1,
        wasmBuffer: Buffer.from('wasm-1'),
        expiresAt: now + 10000,
      });
      await service.createSession('expired', {
        lastStep: 1,
        wasmBuffer: Buffer.from('wasm-2'),
        expiresAt: now - 5000,
        deploying: false,
      });
      await service.createSession('expired-deploying', {
        lastStep: 3,
        wasmBuffer: Buffer.from('wasm-3'),
        expiresAt: now - 5000,
        deploying: true, // deploying sessions are not removed automatically
      });

      await service.cleanExpiredSessions();

      expect(await service.getSession('active')).toBeDefined();
      expect(ContractWizardSessionService.getFallbackSessions().has('expired')).toBe(false);
      expect(ContractWizardSessionService.getFallbackSessions().has('expired-deploying')).toBe(
        true,
      );
    });

    it('updates an existing session in place', async () => {
      const token = 'token-update';
      await service.createSession(token, {
        lastStep: 1,
        wasmBuffer: Buffer.from('wasm'),
        expiresAt: Date.now() + 10000,
      });

      const session = (await service.getSession(token))!;
      session.deploying = true;
      await service.updateSession(token, session);

      const updated = await service.getSession(token);
      expect(updated?.deploying).toBe(true);
    });

    it('rotates a session from oldToken to nextToken', async () => {
      const oldToken = 'old-token';
      const nextToken = 'next-token';
      const sampleWasm = Buffer.from('wasm-bytes');
      await service.createSession(oldToken, {
        lastStep: 1,
        wasmBuffer: sampleWasm,
        expiresAt: Date.now() + 10000,
      });

      const session = (await service.getSession(oldToken))!;
      session.lastStep = 2;
      session.admin = 'GADMIN...';
      session.args = ['arg1'];

      await service.rotateSession(oldToken, nextToken, session);

      expect(await service.getSession(oldToken)).toBeNull();
      const nextSession = await service.getSession(nextToken);
      expect(nextSession).toBeDefined();
      expect(nextSession?.lastStep).toBe(2);
      expect(nextSession?.admin).toBe('GADMIN...');
      expect(nextSession?.args).toEqual(['arg1']);
      expect(nextSession?.wasmBuffer).toEqual(sampleWasm);
    });

    it('deletes a session and decrements buffer bytes', async () => {
      const token = 'delete-token';
      const sampleWasm = Buffer.from('12345678');
      await service.createSession(token, {
        lastStep: 1,
        wasmBuffer: sampleWasm,
        expiresAt: Date.now() + 10000,
      });

      expect(ContractWizardSessionService.getFallbackBufferBytes()).toBe(8);
      await service.deleteSession(token);
      expect(await service.getSession(token)).toBeNull();
      expect(ContractWizardSessionService.getFallbackBufferBytes()).toBe(0);
    });

    it('evicts the oldest non-deploying session when capacity is reached', async () => {
      const wasm = Buffer.from('wasm');
      for (let i = 0; i < MAX_WIZARD_SESSIONS; i++) {
        await service.createSession(`token-${i}`, {
          lastStep: 1,
          wasmBuffer: wasm,
          expiresAt: Date.now() + 10000,
        });
      }

      expect(ContractWizardSessionService.getFallbackSessions().size).toBe(MAX_WIZARD_SESSIONS);

      // Trigger capacity check for a 33rd session
      await service.ensureCapacity(wasm.length);
      await service.createSession('token-new', {
        lastStep: 1,
        wasmBuffer: wasm,
        expiresAt: Date.now() + 10000,
      });

      // Oldest session (token-0) should have been evicted
      expect(await service.getSession('token-0')).toBeNull();
      expect(await service.getSession('token-new')).toBeDefined();
      expect(ContractWizardSessionService.getFallbackSessions().size).toBe(MAX_WIZARD_SESSIONS);
    });

    it('throws ServiceUnavailableException when all sessions are deploying and capacity is full', async () => {
      const wasm = Buffer.from('wasm');
      for (let i = 0; i < MAX_WIZARD_SESSIONS; i++) {
        await service.createSession(`token-${i}`, {
          lastStep: 1,
          wasmBuffer: wasm,
          expiresAt: Date.now() + 10000,
          deploying: true, // all sessions marked deploying
        });
      }

      await expect(service.ensureCapacity(wasm.length)).rejects.toThrow(
        ServiceUnavailableException,
      );
    });

    it('throws BadRequestException when wasmBuffer exceeds MAX_WIZARD_BUFFER_BYTES', async () => {
      await expect(service.ensureCapacity(MAX_WIZARD_BUFFER_BYTES + 1)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('Redis-Backed Session Storage', () => {
    let redisStore: Map<string, string>;
    let zsetStore: Map<string, { score: number; value: string }[]>;
    let mockRedisClient: MockRedis;
    let service: ContractWizardSessionService;

    beforeEach(() => {
      redisStore = new Map();
      zsetStore = new Map();

      mockRedisClient = {
        get: jest.fn(async (key: string) => redisStore.get(key) ?? null),
        set: jest.fn(async (key: string, value: string, _options?: { EX?: number }) => {
          redisStore.set(key, value);
          return 'OK';
        }),
        del: jest.fn(async (key: string) => {
          const existed = redisStore.has(key);
          redisStore.delete(key);
          return existed ? 1 : 0;
        }),
        zAdd: jest.fn(async (key: string, member: { score: number; value: string }) => {
          const list = zsetStore.get(key) ?? [];
          const idx = list.findIndex((m) => m.value === member.value);
          if (idx >= 0) list[idx] = member;
          else list.push(member);
          list.sort((a, b) => a.score - b.score);
          zsetStore.set(key, list);
          return 1;
        }),
        zRem: jest.fn(async (key: string, member: string) => {
          const list = zsetStore.get(key) ?? [];
          const filtered = list.filter((m) => m.value !== member);
          zsetStore.set(key, filtered);
          return list.length - filtered.length;
        }),
        zCard: jest.fn(async (key: string) => (zsetStore.get(key) ?? []).length),
        zRange: jest.fn(async (key: string, start: number, stop: number) => {
          const list = zsetStore.get(key) ?? [];
          const sliced = list.slice(start, stop < 0 ? undefined : stop + 1);
          return sliced.map((m) => m.value);
        }),
        zRemRangeByScore: jest.fn(async (key: string, min: number, max: number) => {
          const list = zsetStore.get(key) ?? [];
          const remaining = list.filter((m) => m.score < min || m.score > max);
          zsetStore.set(key, remaining);
          return list.length - remaining.length;
        }),
        multi: jest.fn(() => {
          const queue: (() => Promise<unknown>)[] = [];
          const multiObj: MockRedisMulti = {
            set: jest.fn((k: string, v: string, opts?: { EX?: number }) => {
              queue.push(() => mockRedisClient.set(k, v, opts));
              return multiObj;
            }),
            del: jest.fn((k: string) => {
              queue.push(() => mockRedisClient.del(k));
              return multiObj;
            }),
            zAdd: jest.fn((k: string, m: { score: number; value: string }) => {
              queue.push(() => mockRedisClient.zAdd(k, m));
              return multiObj;
            }),
            zRem: jest.fn((k: string, m: string) => {
              queue.push(() => mockRedisClient.zRem(k, m));
              return multiObj;
            }),
            exec: jest.fn(async () => {
              const results: unknown[] = [];
              for (const op of queue) {
                results.push(await op());
              }
              return results;
            }),
          };
          return multiObj;
        }),
      };

      const configService = {
        get: jest.fn((key: string) => (key === 'REDIS_URL' ? 'redis://localhost:6379' : undefined)),
      } as unknown as ConfigService;

      service = new ContractWizardSessionService(
        configService,
        undefined,
        mockRedisClient as unknown as RedisClientType,
      );
    });

    it('reports Redis as configured when client is provided', () => {
      expect(service.isRedisConfigured()).toBe(true);
    });

    it('persists a session into Redis with key prefix and ZSET index', async () => {
      const token = 'redis-session-token';
      const wasmBuffer = Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);
      const session: WizardSessionData = {
        lastStep: 1,
        wasmBuffer,
        expiresAt: Date.now() + DEFAULT_WIZARD_SESSION_TTL_MS,
      };

      await service.createSession(token, session);

      expect(redisStore.has(`${WIZARD_SESSION_KEY_PREFIX}${token}`)).toBe(true);
      const indexList = zsetStore.get(WIZARD_SESSIONS_INDEX_KEY);
      expect(indexList?.some((m) => m.value === token)).toBe(true);

      const retrieved = await service.getSession(token);
      expect(retrieved).toBeDefined();
      expect(retrieved?.lastStep).toBe(1);
      expect(retrieved?.wasmBuffer).toEqual(wasmBuffer);
    });

    it('handles session rotation atomically in Redis', async () => {
      const oldToken = 'old-redis-token';
      const nextToken = 'new-redis-token';
      const wasmBuffer = Buffer.from('smart-contract-wasm');

      await service.createSession(oldToken, {
        lastStep: 1,
        wasmBuffer,
        expiresAt: Date.now() + 10000,
      });

      const session = (await service.getSession(oldToken))!;
      session.lastStep = 2;
      session.admin = 'GCADMIN...';
      session.salt = 'random-salt-123';
      session.args = ['arg-val'];
      session.expiresAt = Date.now() + 20000;

      await service.rotateSession(oldToken, nextToken, session);

      // Old token deleted from Redis store and ZSET
      expect(await service.getSession(oldToken)).toBeNull();
      expect(redisStore.has(`${WIZARD_SESSION_KEY_PREFIX}${oldToken}`)).toBe(false);

      // New token available with updated properties
      const nextSession = await service.getSession(nextToken);
      expect(nextSession).toBeDefined();
      expect(nextSession?.lastStep).toBe(2);
      expect(nextSession?.admin).toBe('GCADMIN...');
      expect(nextSession?.salt).toBe('random-salt-123');
      expect(nextSession?.args).toEqual(['arg-val']);
      expect(nextSession?.wasmBuffer).toEqual(wasmBuffer);
    });

    it('updates session state in Redis', async () => {
      const token = 'update-token';
      await service.createSession(token, {
        lastStep: 2,
        wasmBuffer: Buffer.from('wasm'),
        expiresAt: Date.now() + 10000,
      });

      const session = (await service.getSession(token))!;
      session.deploying = true;
      await service.updateSession(token, session);

      const updated = await service.getSession(token);
      expect(updated?.deploying).toBe(true);
    });

    it('deletes session from Redis and ZSET index', async () => {
      const token = 'delete-token';
      await service.createSession(token, {
        lastStep: 1,
        wasmBuffer: Buffer.from('wasm'),
        expiresAt: Date.now() + 10000,
      });

      await service.deleteSession(token);

      expect(await service.getSession(token)).toBeNull();
      expect(redisStore.has(`${WIZARD_SESSION_KEY_PREFIX}${token}`)).toBe(false);
      const indexList = zsetStore.get(WIZARD_SESSIONS_INDEX_KEY) ?? [];
      expect(indexList.some((m) => m.value === token)).toBe(false);
    });

    it('purges expired session upon retrieval and returns null', async () => {
      const token = 'expired-redis';
      await service.createSession(token, {
        lastStep: 1,
        wasmBuffer: Buffer.from('wasm'),
        expiresAt: Date.now() - 5000, // expired
      });

      const retrieved = await service.getSession(token);
      expect(retrieved).toBeNull();
      expect(redisStore.has(`${WIZARD_SESSION_KEY_PREFIX}${token}`)).toBe(false);
    });

    it('handles malformed JSON in Redis gracefully without crashing', async () => {
      const token = 'corrupt-session';
      redisStore.set(`${WIZARD_SESSION_KEY_PREFIX}${token}`, '{ invalid json ...');

      const retrieved = await service.getSession(token);
      expect(retrieved).toBeNull();
      // Corrupt key should be cleaned up
      expect(redisStore.has(`${WIZARD_SESSION_KEY_PREFIX}${token}`)).toBe(false);
    });

    it('evicts oldest non-deploying session in Redis when capacity is reached', async () => {
      const wasm = Buffer.from('wasm');
      const now = Date.now();

      for (let i = 0; i < MAX_WIZARD_SESSIONS; i++) {
        await service.createSession(`session-${i}`, {
          lastStep: 1,
          wasmBuffer: wasm,
          expiresAt: now + 10000 + i, // sequential scores
        });
      }

      expect(await mockRedisClient.zCard(WIZARD_SESSIONS_INDEX_KEY)).toBe(MAX_WIZARD_SESSIONS);

      // Request capacity for session 33
      await service.ensureCapacity(wasm.length);
      await service.createSession('session-33', {
        lastStep: 1,
        wasmBuffer: wasm,
        expiresAt: now + 50000,
      });

      // session-0 should have been evicted
      expect(await service.getSession('session-0')).toBeNull();
      expect(await service.getSession('session-33')).toBeDefined();
    });

    it('skips deploying sessions during capacity eviction in Redis', async () => {
      const wasm = Buffer.from('wasm');
      const now = Date.now();

      // session-0 is deploying
      await service.createSession('session-0', {
        lastStep: 3,
        wasmBuffer: wasm,
        expiresAt: now + 10000,
        deploying: true,
      });

      // session-1 is not deploying
      await service.createSession('session-1', {
        lastStep: 1,
        wasmBuffer: wasm,
        expiresAt: now + 10001,
        deploying: false,
      });

      for (let i = 2; i < MAX_WIZARD_SESSIONS; i++) {
        await service.createSession(`session-${i}`, {
          lastStep: 1,
          wasmBuffer: wasm,
          expiresAt: now + 10000 + i,
        });
      }

      await service.ensureCapacity(wasm.length);

      // session-0 should NOT be evicted because deploying = true
      expect(await service.getSession('session-0')).toBeDefined();
      // session-1 should be evicted instead
      expect(await service.getSession('session-1')).toBeNull();
    });
  });

  describe('Multi-Replica / Cross-Instance Session Sharing', () => {
    it('allows separate service instances sharing the same Redis store to access and mutate sessions', async () => {
      const sharedRedisStore = new Map<string, string>();
      const sharedZsetStore = new Map<string, { score: number; value: string }[]>();

      const createMockClient = () => ({
        get: jest.fn(async (key: string) => sharedRedisStore.get(key) ?? null),
        set: jest.fn(async (key: string, value: string) => {
          sharedRedisStore.set(key, value);
          return 'OK';
        }),
        del: jest.fn(async (key: string) => {
          const existed = sharedRedisStore.has(key);
          sharedRedisStore.delete(key);
          return existed ? 1 : 0;
        }),
        zAdd: jest.fn(async (key: string, member: { score: number; value: string }) => {
          const list = sharedZsetStore.get(key) ?? [];
          list.push(member);
          list.sort((a, b) => a.score - b.score);
          sharedZsetStore.set(key, list);
          return 1;
        }),
        zRem: jest.fn(async (key: string, member: string) => {
          const list = sharedZsetStore.get(key) ?? [];
          const filtered = list.filter((m) => m.value !== member);
          sharedZsetStore.set(key, filtered);
          return list.length - filtered.length;
        }),
        zCard: jest.fn(async (key: string) => (sharedZsetStore.get(key) ?? []).length),
        zRange: jest.fn(async (key: string, start: number, stop: number) => {
          const list = sharedZsetStore.get(key) ?? [];
          return list.slice(start, stop < 0 ? undefined : stop + 1).map((m) => m.value);
        }),
        zRemRangeByScore: jest.fn(async (key: string, min: number, max: number) => {
          const list = sharedZsetStore.get(key) ?? [];
          const remaining = list.filter((m) => m.score < min || m.score > max);
          sharedZsetStore.set(key, remaining);
          return list.length - remaining.length;
        }),
        multi: jest.fn(() => {
          interface SharedMulti {
            set: (k: string, v: string) => SharedMulti;
            del: (k: string) => SharedMulti;
            zAdd: (k: string, item: { score: number; value: string }) => SharedMulti;
            zRem: (k: string, member: string) => SharedMulti;
            exec: () => Promise<unknown[]>;
          }
          const ops: (() => Promise<unknown>)[] = [];
          const m: SharedMulti = {
            set: (k: string, v: string) => {
              ops.push(async () => sharedRedisStore.set(k, v));
              return m;
            },
            del: (k: string) => {
              ops.push(async () => sharedRedisStore.delete(k));
              return m;
            },
            zAdd: (k: string, item: { score: number; value: string }) => {
              ops.push(async () => {
                const list = sharedZsetStore.get(k) ?? [];
                list.push(item);
                sharedZsetStore.set(k, list);
              });
              return m;
            },
            zRem: (k: string, member: string) => {
              ops.push(async () => {
                const list = sharedZsetStore.get(k) ?? [];
                sharedZsetStore.set(
                  k,
                  list.filter((x) => x.value !== member),
                );
              });
              return m;
            },
            exec: async () => {
              for (const op of ops) await op();
              return [];
            },
          };
          return m;
        }),
      });

      const configService = {
        get: jest.fn((k: string) => (k === 'REDIS_URL' ? 'redis://cluster:6379' : undefined)),
      } as unknown as ConfigService;

      // Replica 1 and Replica 2
      const replica1 = new ContractWizardSessionService(
        configService,
        undefined,
        createMockClient() as unknown as RedisClientType,
      );
      const replica2 = new ContractWizardSessionService(
        configService,
        undefined,
        createMockClient() as unknown as RedisClientType,
      );

      // Step 1: Replica 1 uploads WASM and creates session
      const step1Token = 'shared-step-1-token';
      const wasmBuffer = Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);
      await replica1.createSession(step1Token, {
        lastStep: 1,
        wasmBuffer,
        expiresAt: Date.now() + 10000,
      });

      // Step 2: Request arrives at Replica 2
      const sessionOnReplica2 = await replica2.getSession(step1Token);
      expect(sessionOnReplica2).toBeDefined();
      expect(sessionOnReplica2?.wasmBuffer).toEqual(wasmBuffer);

      // Replica 2 configures parameters and rotates token
      const step2Token = 'shared-step-2-token';
      sessionOnReplica2!.lastStep = 2;
      sessionOnReplica2!.admin = 'GDISTRIBUTED...';
      sessionOnReplica2!.args = ['param'];
      await replica2.rotateSession(step1Token, step2Token, sessionOnReplica2!);

      // Step 3: Request arrives back at Replica 1
      expect(await replica1.getSession(step1Token)).toBeNull(); // old token consumed
      const sessionOnReplica1 = await replica1.getSession(step2Token);
      expect(sessionOnReplica1).toBeDefined();
      expect(sessionOnReplica1?.lastStep).toBe(2);
      expect(sessionOnReplica1?.admin).toBe('GDISTRIBUTED...');
      expect(sessionOnReplica1?.wasmBuffer).toEqual(wasmBuffer);

      // Replica 1 finishes deployment and deletes session
      await replica1.deleteSession(step2Token);
      expect(await replica2.getSession(step2Token)).toBeNull();
    });
  });

  describe('Redis Errors & Failure Handling', () => {
    it('throws ServiceUnavailableException when Redis is configured but provider is not ready', async () => {
      const configService = {
        get: jest.fn((key: string) => (key === 'REDIS_URL' ? 'redis://localhost:6379' : undefined)),
      } as unknown as ConfigService;

      const mockRedisProvider = {
        isReady: jest.fn().mockReturnValue(false),
        getClient: jest.fn(),
      } as unknown as RedisProvider;

      const service = new ContractWizardSessionService(configService, mockRedisProvider);

      await expect(
        service.createSession('token', {
          lastStep: 1,
          wasmBuffer: Buffer.from('wasm'),
          expiresAt: Date.now() + 10000,
        }),
      ).rejects.toThrow(ServiceUnavailableException);

      await expect(service.getSession('token')).rejects.toThrow(ServiceUnavailableException);
    });

    it('throws ServiceUnavailableException when Redis operation rejects', async () => {
      const configService = {
        get: jest.fn((key: string) => (key === 'REDIS_URL' ? 'redis://localhost:6379' : undefined)),
      } as unknown as ConfigService;

      const failingClient = {
        get: jest.fn().mockRejectedValue(new Error('Connection reset by peer')),
        multi: jest.fn().mockReturnValue({
          set: jest.fn().mockReturnThis(),
          zAdd: jest.fn().mockReturnThis(),
          exec: jest.fn().mockRejectedValue(new Error('Write failed')),
        }),
      };

      const service = new ContractWizardSessionService(
        configService,
        undefined,
        failingClient as unknown as RedisClientType,
      );

      await expect(service.getSession('any-token')).rejects.toThrow(ServiceUnavailableException);

      await expect(
        service.createSession('any-token', {
          lastStep: 1,
          wasmBuffer: Buffer.from('wasm'),
          expiresAt: Date.now() + 10000,
        }),
      ).rejects.toThrow(ServiceUnavailableException);
    });
  });
});
