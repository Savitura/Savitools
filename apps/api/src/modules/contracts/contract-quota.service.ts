import { HttpException, HttpStatus, Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { RedisClientType } from 'redis';

export type ContractQuotaAction = 'deploy' | 'invoke';

export const DEFAULT_CONTRACT_DAILY_DEPLOY_QUOTA = 10;
export const DEFAULT_CONTRACT_DAILY_INVOKE_QUOTA = 100;

const QUOTA_CONFIG_KEYS: Record<ContractQuotaAction, string> = {
  deploy: 'CONTRACT_DAILY_DEPLOY_QUOTA',
  invoke: 'CONTRACT_DAILY_INVOKE_QUOTA',
};

const QUOTA_DEFAULTS: Record<ContractQuotaAction, number> = {
  deploy: DEFAULT_CONTRACT_DAILY_DEPLOY_QUOTA,
  invoke: DEFAULT_CONTRACT_DAILY_INVOKE_QUOTA,
};

/** Seconds a day's counter is kept; a little over 24h so the key outlives its day. */
const QUOTA_KEY_TTL_SECONDS = 26 * 60 * 60;

/**
 * Per-user daily quota for actions that spend from the shared DEPLOYER_SECRET_KEY
 * account (Savitura/Savitools#425). The email allowlist decides *who* may deploy
 * or invoke; this caps *how much* any one of them can drain the shared account.
 *
 * Counters live in Redis (one key per user, action and UTC day) so the limit holds
 * across replicas. If Redis is unavailable the service falls back to a
 * process-local counter rather than letting the call through unmetered.
 */
@Injectable()
export class ContractQuotaService {
  private readonly logger = new Logger(ContractQuotaService.name);
  private readonly localCounters = new Map<string, number>();
  private localDay = '';

  constructor(
    private readonly configService: ConfigService,
    @Optional() @Inject('REDIS_CLIENT') private readonly redis?: RedisClientType,
  ) {}

  getLimit(action: ContractQuotaAction): number {
    const raw = this.configService.get<string>(QUOTA_CONFIG_KEYS[action]);
    if (raw === undefined || raw === '') return QUOTA_DEFAULTS[action];
    const parsed = Number.parseInt(String(raw), 10);
    return Number.isInteger(parsed) && parsed >= 0 ? parsed : QUOTA_DEFAULTS[action];
  }

  /**
   * Counts one `action` against `userId`'s quota for the current UTC day.
   * Throws 429 once the limit is exceeded.
   */
  async consume(userId: string, action: ContractQuotaAction, now = new Date()): Promise<void> {
    const limit = this.getLimit(action);
    const day = now.toISOString().slice(0, 10);
    const key = `contracts:quota:${action}:${userId}:${day}`;

    const used = await this.increment(key, day);
    if (used > limit) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          error: 'Too Many Requests',
          message: `Daily contract ${action} quota of ${limit} reached; it resets at 00:00 UTC`,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private async increment(key: string, day: string): Promise<number> {
    if (this.redis) {
      try {
        const used = await this.redis.incr(key);
        if (used === 1) {
          await this.redis.expire(key, QUOTA_KEY_TTL_SECONDS);
        }
        return used;
      } catch (error) {
        this.logger.warn(
          `Redis quota counter unavailable, using process-local counter: ${(error as Error).message}`,
        );
      }
    }

    if (this.localDay !== day) {
      this.localCounters.clear();
      this.localDay = day;
    }
    const used = (this.localCounters.get(key) ?? 0) + 1;
    this.localCounters.set(key, used);
    return used;
  }
}
