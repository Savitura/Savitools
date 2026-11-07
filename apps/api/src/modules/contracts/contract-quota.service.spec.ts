import { ConfigService } from '@nestjs/config';
import { HttpException, HttpStatus } from '@nestjs/common';
import type { RedisClientType } from 'redis';
import {
  ContractQuotaService,
  DEFAULT_CONTRACT_DAILY_DEPLOY_QUOTA,
  DEFAULT_CONTRACT_DAILY_INVOKE_QUOTA,
} from './contract-quota.service';

const configWith = (values: Record<string, string> = {}) =>
  ({ get: jest.fn((key: string) => values[key]) }) as unknown as ConfigService;

const expectQuotaError = async (promise: Promise<unknown>) => {
  const error = await promise.then(
    () => undefined,
    (err: unknown) => err,
  );
  expect(error).toBeInstanceOf(HttpException);
  expect((error as HttpException).getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
};

describe('ContractQuotaService', () => {
  it('uses the default limits when none are configured', () => {
    const service = new ContractQuotaService(configWith());
    expect(service.getLimit('deploy')).toBe(DEFAULT_CONTRACT_DAILY_DEPLOY_QUOTA);
    expect(service.getLimit('invoke')).toBe(DEFAULT_CONTRACT_DAILY_INVOKE_QUOTA);
  });

  it('ignores invalid configured limits', () => {
    const service = new ContractQuotaService(
      configWith({ CONTRACT_DAILY_DEPLOY_QUOTA: 'lots', CONTRACT_DAILY_INVOKE_QUOTA: '-3' }),
    );
    expect(service.getLimit('deploy')).toBe(DEFAULT_CONTRACT_DAILY_DEPLOY_QUOTA);
    expect(service.getLimit('invoke')).toBe(DEFAULT_CONTRACT_DAILY_INVOKE_QUOTA);
  });

  it('allows up to the limit per user, per action, per UTC day', async () => {
    const service = new ContractQuotaService(configWith({ CONTRACT_DAILY_DEPLOY_QUOTA: '2' }));
    const day1 = new Date('2026-10-17T10:00:00Z');

    await service.consume('alice', 'deploy', day1);
    await service.consume('alice', 'deploy', day1);
    await expectQuotaError(service.consume('alice', 'deploy', day1));

    // Other users and other actions have their own counters.
    await expect(service.consume('bob', 'deploy', day1)).resolves.toBeUndefined();
    await expect(service.consume('alice', 'invoke', day1)).resolves.toBeUndefined();

    // The counter resets on the next UTC day.
    await expect(
      service.consume('alice', 'deploy', new Date('2026-10-18T00:00:01Z')),
    ).resolves.toBeUndefined();
  });

  it('counts in Redis with an expiry so the limit holds across replicas', async () => {
    const counts = new Map<string, number>();
    const redis = {
      incr: jest.fn(async (key: string) => {
        const next = (counts.get(key) ?? 0) + 1;
        counts.set(key, next);
        return next;
      }),
      expire: jest.fn().mockResolvedValue(true),
    } as unknown as RedisClientType;
    const service = new ContractQuotaService(configWith({ CONTRACT_DAILY_INVOKE_QUOTA: '1' }), redis);
    const now = new Date('2026-10-17T10:00:00Z');

    await service.consume('alice', 'invoke', now);
    await expectQuotaError(service.consume('alice', 'invoke', now));

    expect(redis.incr).toHaveBeenCalledWith('contracts:quota:invoke:alice:2026-10-17');
    expect(redis.expire).toHaveBeenCalledTimes(1);
  });

  it('falls back to a local counter when Redis fails instead of skipping the quota', async () => {
    const redis = {
      incr: jest.fn().mockRejectedValue(new Error('connection refused')),
      expire: jest.fn(),
    } as unknown as RedisClientType;
    const service = new ContractQuotaService(configWith({ CONTRACT_DAILY_INVOKE_QUOTA: '1' }), redis);

    await service.consume('alice', 'invoke');
    await expectQuotaError(service.consume('alice', 'invoke'));
  });
});
