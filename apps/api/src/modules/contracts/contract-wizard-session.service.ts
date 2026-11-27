import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { RedisClientType } from 'redis';
import { RedisProvider } from '../../common/redis.provider';

export interface WizardSessionData {
  lastStep: number;
  wasmBuffer?: Buffer;
  admin?: string;
  salt?: string;
  args?: unknown[];
  expiresAt: number;
  deploying?: boolean;
}

interface StoredWizardSession {
  lastStep: number;
  wasmBase64?: string;
  admin?: string;
  salt?: string;
  args?: unknown[];
  expiresAt: number;
  deploying?: boolean;
}

export const WIZARD_SESSION_KEY_PREFIX = 'contracts:wizard:session:';
export const WIZARD_SESSIONS_INDEX_KEY = 'contracts:wizard:sessions';
export const MAX_WIZARD_SESSIONS = 32;
export const MAX_WIZARD_BUFFER_BYTES = 32 * 1024 * 1024; // 32MB
export const DEFAULT_WIZARD_SESSION_TTL_MS = 3600 * 1000; // 1-hour TTL

/**
 * Manages contract deployment wizard sessions across API replicas using Redis
 * with TTL support when configured, and provides an in-memory fallback for
 * local development without Redis.
 */
@Injectable()
export class ContractWizardSessionService {
  private readonly logger = new Logger(ContractWizardSessionService.name);
  public static readonly DEFAULT_TTL_MS = DEFAULT_WIZARD_SESSION_TTL_MS;
  public static readonly MAX_WIZARD_SESSIONS = MAX_WIZARD_SESSIONS;
  public static readonly MAX_WIZARD_BUFFER_BYTES = MAX_WIZARD_BUFFER_BYTES;

  // In-memory fallback state used when Redis is not configured.
  private static readonly fallbackSessions = new Map<string, WizardSessionData>();
  private static fallbackBufferBytes = 0;

  constructor(
    @Optional() private readonly configService?: ConfigService,
    @Optional() private readonly redisProvider?: RedisProvider,
    @Optional() @Inject('REDIS_CLIENT') private readonly redisClient?: RedisClientType,
  ) {}

  /**
   * For backwards-compatible inspection in tests.
   */
  static getFallbackSessions(): Map<string, WizardSessionData> {
    return ContractWizardSessionService.fallbackSessions;
  }

  static getFallbackBufferBytes(): number {
    return ContractWizardSessionService.fallbackBufferBytes;
  }

  static clearFallbackSessions(): void {
    ContractWizardSessionService.fallbackSessions.clear();
    ContractWizardSessionService.fallbackBufferBytes = 0;
  }

  static removeFallbackSession(token: string): void {
    const session = ContractWizardSessionService.fallbackSessions.get(token);
    if (!session) return;
    ContractWizardSessionService.fallbackSessions.delete(token);
    ContractWizardSessionService.fallbackBufferBytes -= session.wasmBuffer?.length ?? 0;
  }

  /**
   * Determines whether Redis is explicitly configured in the environment.
   */
  isRedisConfigured(): boolean {
    if (this.redisClient) return true;
    const redisUrl = this.configService?.get<string>('REDIS_URL');
    return typeof redisUrl === 'string' && redisUrl.trim().length > 0;
  }

  /**
   * Returns a ready Redis client if available.
   */
  private getReadyClient(): RedisClientType | null {
    if (this.redisClient) return this.redisClient;
    if (this.redisProvider && this.redisProvider.isReady()) {
      try {
        return this.redisProvider.getClient();
      } catch {
        return null;
      }
    }
    return null;
  }

  private sessionKey(token: string): string {
    return `${WIZARD_SESSION_KEY_PREFIX}${token}`;
  }

  private serializeSession(session: WizardSessionData): string {
    const stored: StoredWizardSession = {
      lastStep: session.lastStep,
      wasmBase64: session.wasmBuffer ? session.wasmBuffer.toString('base64') : undefined,
      admin: session.admin,
      salt: session.salt,
      args: session.args,
      expiresAt: session.expiresAt,
      deploying: session.deploying,
    };
    return JSON.stringify(stored);
  }

  private deserializeSession(raw: string): WizardSessionData | null {
    try {
      const data = JSON.parse(raw) as StoredWizardSession;
      if (typeof data !== 'object' || data === null) {
        return null;
      }
      if (typeof data.lastStep !== 'number' || typeof data.expiresAt !== 'number') {
        return null;
      }
      return {
        lastStep: data.lastStep,
        wasmBuffer: data.wasmBase64 ? Buffer.from(data.wasmBase64, 'base64') : undefined,
        admin: typeof data.admin === 'string' ? data.admin : undefined,
        salt: typeof data.salt === 'string' ? data.salt : undefined,
        args: Array.isArray(data.args) ? data.args : undefined,
        expiresAt: data.expiresAt,
        deploying: Boolean(data.deploying),
      };
    } catch {
      this.logger.warn('Failed to deserialize wizard session data from Redis');
      return null;
    }
  }

  /**
   * Cleans up expired wizard sessions.
   */
  async cleanExpiredSessions(): Promise<void> {
    const now = Date.now();

    if (this.isRedisConfigured()) {
      const client = this.getReadyClient();
      if (!client) {
        throw new ServiceUnavailableException(
          'Contract wizard session storage is temporarily unavailable',
        );
      }
      try {
        await client.zRemRangeByScore(WIZARD_SESSIONS_INDEX_KEY, 0, now);
      } catch (error) {
        this.logger.error(`Redis cleanExpiredSessions failed: ${(error as Error).message}`);
        throw new ServiceUnavailableException(
          'Contract wizard session storage is temporarily unavailable',
        );
      }
      return;
    }

    // In-memory fallback cleanup
    for (const [k, v] of ContractWizardSessionService.fallbackSessions.entries()) {
      if (v.expiresAt < now && !v.deploying) {
        ContractWizardSessionService.removeFallbackSession(k);
      }
    }
  }

  /**
   * Ensures wizard session capacity constraints are respected, evicting the oldest
   * non-deploying sessions if needed or throwing 503 if capacity cannot be freed.
   */
  async ensureCapacity(wasmBytes: number): Promise<void> {
    if (wasmBytes > MAX_WIZARD_BUFFER_BYTES) {
      throw new BadRequestException('WASM file exceeds the deployment wizard storage limit');
    }

    const now = Date.now();

    if (this.isRedisConfigured()) {
      const client = this.getReadyClient();
      if (!client) {
        throw new ServiceUnavailableException(
          'Contract wizard session storage is temporarily unavailable',
        );
      }

      try {
        await client.zRemRangeByScore(WIZARD_SESSIONS_INDEX_KEY, 0, now);
        let count = await client.zCard(WIZARD_SESSIONS_INDEX_KEY);

        while (count >= MAX_WIZARD_SESSIONS) {
          const oldestTokens = await client.zRange(WIZARD_SESSIONS_INDEX_KEY, 0, 10);
          if (oldestTokens.length === 0) break;

          let evicted = false;
          for (const token of oldestTokens) {
            const raw = await client.get(this.sessionKey(token));
            if (!raw) {
              await client.zRem(WIZARD_SESSIONS_INDEX_KEY, token);
              evicted = true;
              break;
            }

            const session = this.deserializeSession(raw);
            if (!session || (!session.deploying && session.expiresAt >= now)) {
              await client.del(this.sessionKey(token));
              await client.zRem(WIZARD_SESSIONS_INDEX_KEY, token);
              evicted = true;
              break;
            }
          }

          if (!evicted) break;
          count = await client.zCard(WIZARD_SESSIONS_INDEX_KEY);
        }

        if (count >= MAX_WIZARD_SESSIONS) {
          throw new ServiceUnavailableException('Deployment wizard capacity is temporarily full');
        }
      } catch (error) {
        if (error instanceof ServiceUnavailableException || error instanceof BadRequestException) {
          throw error;
        }
        this.logger.error(`Redis ensureCapacity failed: ${(error as Error).message}`);
        throw new ServiceUnavailableException(
          'Contract wizard session storage is temporarily unavailable',
        );
      }
      return;
    }

    // In-memory fallback capacity check
    while (
      ContractWizardSessionService.fallbackSessions.size >= MAX_WIZARD_SESSIONS ||
      ContractWizardSessionService.fallbackBufferBytes + wasmBytes > MAX_WIZARD_BUFFER_BYTES
    ) {
      const oldestToken = [...ContractWizardSessionService.fallbackSessions.entries()].find(
        ([, session]) => !session.deploying,
      )?.[0];
      if (!oldestToken) break;
      ContractWizardSessionService.removeFallbackSession(oldestToken);
    }

    if (
      ContractWizardSessionService.fallbackSessions.size >= MAX_WIZARD_SESSIONS ||
      ContractWizardSessionService.fallbackBufferBytes + wasmBytes > MAX_WIZARD_BUFFER_BYTES
    ) {
      throw new ServiceUnavailableException('Deployment wizard capacity is temporarily full');
    }
  }

  /**
   * Creates a new wizard session under the specified step token.
   */
  async createSession(token: string, session: WizardSessionData): Promise<void> {
    if (this.isRedisConfigured()) {
      const client = this.getReadyClient();
      if (!client) {
        throw new ServiceUnavailableException(
          'Contract wizard session storage is temporarily unavailable',
        );
      }

      try {
        const ttlSeconds = Math.max(1, Math.ceil((session.expiresAt - Date.now()) / 1000));
        const serialized = this.serializeSession(session);
        const multi = client.multi();
        multi.set(this.sessionKey(token), serialized, { EX: ttlSeconds });
        multi.zAdd(WIZARD_SESSIONS_INDEX_KEY, { score: session.expiresAt, value: token });
        await multi.exec();
      } catch (error) {
        this.logger.error(`Redis createSession failed: ${(error as Error).message}`);
        throw new ServiceUnavailableException(
          'Contract wizard session storage is temporarily unavailable',
        );
      }
      return;
    }

    // In-memory fallback
    ContractWizardSessionService.fallbackSessions.set(token, session);
    ContractWizardSessionService.fallbackBufferBytes += session.wasmBuffer?.length ?? 0;
  }

  /**
   * Retrieves an active wizard session. Returns null if missing or expired.
   */
  async getSession(token: string): Promise<WizardSessionData | null> {
    const now = Date.now();

    if (this.isRedisConfigured()) {
      const client = this.getReadyClient();
      if (!client) {
        throw new ServiceUnavailableException(
          'Contract wizard session storage is temporarily unavailable',
        );
      }

      try {
        const raw = await client.get(this.sessionKey(token));
        if (!raw) return null;

        const session = this.deserializeSession(raw);
        if (!session) {
          await client.del(this.sessionKey(token));
          await client.zRem(WIZARD_SESSIONS_INDEX_KEY, token);
          return null;
        }

        if (session.expiresAt < now) {
          await client.del(this.sessionKey(token));
          await client.zRem(WIZARD_SESSIONS_INDEX_KEY, token);
          return null;
        }

        return session;
      } catch (error) {
        if (error instanceof ServiceUnavailableException) throw error;
        this.logger.error(`Redis getSession failed: ${(error as Error).message}`);
        throw new ServiceUnavailableException(
          'Contract wizard session storage is temporarily unavailable',
        );
      }
    }

    // In-memory fallback
    const session = ContractWizardSessionService.fallbackSessions.get(token);
    if (!session) return null;
    if (session.expiresAt < now) {
      ContractWizardSessionService.removeFallbackSession(token);
      return null;
    }
    return session;
  }

  /**
   * Atomically rotates an existing session to a new token with refreshed TTL.
   */
  async rotateSession(
    oldToken: string,
    nextToken: string,
    session: WizardSessionData,
  ): Promise<void> {
    if (this.isRedisConfigured()) {
      const client = this.getReadyClient();
      if (!client) {
        throw new ServiceUnavailableException(
          'Contract wizard session storage is temporarily unavailable',
        );
      }

      try {
        const ttlSeconds = Math.max(1, Math.ceil((session.expiresAt - Date.now()) / 1000));
        const serialized = this.serializeSession(session);
        const multi = client.multi();
        multi.del(this.sessionKey(oldToken));
        multi.zRem(WIZARD_SESSIONS_INDEX_KEY, oldToken);
        multi.set(this.sessionKey(nextToken), serialized, { EX: ttlSeconds });
        multi.zAdd(WIZARD_SESSIONS_INDEX_KEY, { score: session.expiresAt, value: nextToken });
        await multi.exec();
      } catch (error) {
        this.logger.error(`Redis rotateSession failed: ${(error as Error).message}`);
        throw new ServiceUnavailableException(
          'Contract wizard session storage is temporarily unavailable',
        );
      }
      return;
    }

    // In-memory fallback: preserve buffer bytes while rotating token
    ContractWizardSessionService.fallbackSessions.delete(oldToken);
    ContractWizardSessionService.fallbackSessions.set(nextToken, session);
  }

  /**
   * Updates an existing session in place (e.g., setting deploying flag).
   */
  async updateSession(token: string, session: WizardSessionData): Promise<void> {
    if (this.isRedisConfigured()) {
      const client = this.getReadyClient();
      if (!client) {
        throw new ServiceUnavailableException(
          'Contract wizard session storage is temporarily unavailable',
        );
      }

      try {
        const ttlSeconds = Math.max(1, Math.ceil((session.expiresAt - Date.now()) / 1000));
        const serialized = this.serializeSession(session);
        await client.set(this.sessionKey(token), serialized, { EX: ttlSeconds });
      } catch (error) {
        this.logger.error(`Redis updateSession failed: ${(error as Error).message}`);
        throw new ServiceUnavailableException(
          'Contract wizard session storage is temporarily unavailable',
        );
      }
      return;
    }

    // In-memory fallback
    ContractWizardSessionService.fallbackSessions.set(token, session);
  }

  /**
   * Deletes a session and releases its resources.
   */
  async deleteSession(token: string): Promise<void> {
    if (this.isRedisConfigured()) {
      const client = this.getReadyClient();
      if (!client) {
        throw new ServiceUnavailableException(
          'Contract wizard session storage is temporarily unavailable',
        );
      }

      try {
        const multi = client.multi();
        multi.del(this.sessionKey(token));
        multi.zRem(WIZARD_SESSIONS_INDEX_KEY, token);
        await multi.exec();
      } catch (error) {
        this.logger.error(`Redis deleteSession failed: ${(error as Error).message}`);
        throw new ServiceUnavailableException(
          'Contract wizard session storage is temporarily unavailable',
        );
      }
      return;
    }

    // In-memory fallback
    ContractWizardSessionService.removeFallbackSession(token);
  }
}
