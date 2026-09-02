import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, RedisClientType } from 'redis';
import { randomUUID } from 'crypto';
import {
  DEFAULT_MAX_AGE_SECONDS,
  SIGNATURE_HEADER,
  TIMESTAMP_HEADER,
  signBody,
  WebhookSigningStatus,
} from './signature';
import { WEBHOOK_TEMPLATES } from './webhook-templates';
import { SendWebhookDto } from './dto/send-webhook.dto';
import { assertSafeWebhookDestination, MAX_WEBHOOK_REDIRECTS } from './ssrf-guard';

export interface WebhookHistoryEntry {
  id: string;
  userId: string;
  eventType: string;
  endpointUrl: string;
  payload: Record<string, unknown>;
  requestHeaders: Record<string, string>;
  statusCode: number | null;
  responseHeaders: Record<string, string>;
  responseBody: unknown;
  latencyMs: number;
  timestamp: number;
  error?: string;
}

const REDIS_KEY_PREFIX = 'webhook_history';
const REDIS_TTL = 86400;
const MAX_HISTORY = 50;
const REDIRECT_STATUS_CODES = new Set([301, 302, 303, 307, 308]);
const SENSITIVE_HEADER_NAMES = new Set(['set-cookie', 'authorization', 'cookie', 'proxy-authorization']);

function redactHeaders(headers: Record<string, string>): Record<string, string> {
  const redacted: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    redacted[key] = SENSITIVE_HEADER_NAMES.has(key.toLowerCase()) ? '[REDACTED]' : value;
  }
  return redacted;
}

@Injectable()
export class WebhookService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WebhookService.name);
  private redisClient: RedisClientType;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    const redisUrl =
      this.configService.get<string>('REDIS_URL') || 'redis://localhost:6379';
    this.redisClient = createClient({ url: redisUrl });
    this.redisClient.on('error', (err) =>
      this.logger.error('Redis Client Error', err),
    );

    try {
      await this.redisClient.connect();
      this.logger.log('Connected to Redis for Webhook history');
    } catch (err) {
      this.logger.error('Failed to connect to Redis', err);
    }
  }

  async onModuleDestroy() {
    if (this.redisClient) {
      await this.redisClient.quit();
    }
  }

  getTemplates() {
    return WEBHOOK_TEMPLATES;
  }

  /**
   * Global fallback signing secret. When an operator sets
   * WEBHOOK_SIGNING_SECRET, outbound webhooks are signed (timestamped
   * HMAC-SHA256) even when the caller supplies no per-request secret.
   */
  private signingSecret(): string | undefined {
    return this.configService.get<string>('WEBHOOK_SIGNING_SECRET');
  }

  /** Whether signing is enabled and the wire format receivers should expect. */
  getSigningStatus(): WebhookSigningStatus {
    return {
      enabled: Boolean(this.signingSecret()),
      algorithm: 'hmac-sha256',
      signatureHeader: SIGNATURE_HEADER,
      timestampHeader: TIMESTAMP_HEADER,
      replayWindowSeconds: DEFAULT_MAX_AGE_SECONDS,
    };
  }

  async sendWebhook(userId: string, dto: SendWebhookDto): Promise<WebhookHistoryEntry> {
    const template = WEBHOOK_TEMPLATES.find(
      (t) => t.eventType === dto.eventType,
    );
    if (!template && !dto.payload) {
      throw new BadRequestException(
        `Unknown event type "${dto.eventType}". Provide a custom payload or use a valid eventType.`,
      );
    }

    let destinationUrl: URL;
    try {
      destinationUrl = new URL(dto.endpointUrl);
    } catch {
      throw new BadRequestException('endpointUrl must be a valid URL');
    }
    await assertSafeWebhookDestination(destinationUrl);

    const payload = dto.payload ?? template!.samplePayload;
    const body = JSON.stringify(payload);

    const requestHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // Per-request secret wins; WEBHOOK_SIGNING_SECRET is the global fallback.
    const secret = dto.secret || this.signingSecret();
    if (secret) {
      const { signature, timestamp } = signBody({ secret, body });
      requestHeaders[SIGNATURE_HEADER] = signature;
      requestHeaders[TIMESTAMP_HEADER] = timestamp;
    }

    const startTime = Date.now();
    let statusCode: number | null = null;
    let responseHeaders: Record<string, string> = {};
    let responseBody: unknown = null;
    let error: string | undefined;

    try {
      const response = await this.fetchWithRedirectGuard(destinationUrl, {
        method: 'POST',
        headers: requestHeaders,
        body,
        signal: AbortSignal.timeout(30000),
      });

      statusCode = response.status;
      responseHeaders = redactHeaders(Object.fromEntries(response.headers.entries()));

      const contentType = response.headers.get('content-type') ?? '';
      if (contentType.includes('application/json')) {
        responseBody = await response.json();
      } else {
        responseBody = await response.text();
      }
    } catch (err) {
      if (err instanceof BadRequestException) {
        throw err;
      }
      error = err instanceof Error ? err.message : 'Unknown fetch error';
      this.logger.error(`Webhook delivery failed to ${dto.endpointUrl}`, err);
    }

    const latencyMs = Date.now() - startTime;

    const entry: WebhookHistoryEntry = {
      id: randomUUID(),
      userId,
      eventType: dto.eventType,
      endpointUrl: dto.endpointUrl,
      payload,
      requestHeaders: redactHeaders(requestHeaders),
      statusCode,
      responseHeaders,
      responseBody,
      latencyMs,
      timestamp: Date.now(),
      error,
    };

    await this.storeEntry(entry);

    return entry;
  }

  async getHistory(userId: string): Promise<WebhookHistoryEntry[]> {
    try {
      const results = await this.redisClient.lRange(this.historyKey(userId), 0, -1);
      return results.map((r) => JSON.parse(r) as WebhookHistoryEntry);
    } catch (err) {
      this.logger.error('Failed to fetch webhook history', err);
      return [];
    }
  }

  async replay(id: string, userId: string): Promise<WebhookHistoryEntry> {
    const history = await this.getHistory(userId);
    const original = history.find((entry) => entry.id === id);

    if (!original) {
      throw new NotFoundException(`Webhook attempt ${id} not found`);
    }

    return this.sendWebhook(userId, {
      endpointUrl: original.endpointUrl,
      eventType: original.eventType,
      payload: original.payload,
    });
  }

  /**
   * Follows redirects manually so each hop's destination is re-validated
   * against the SSRF guard before being requested — otherwise an attacker
   * could point the initial URL at a public host that 302s to an internal one.
   */
  private async fetchWithRedirectGuard(url: URL, init: RequestInit): Promise<Response> {
    let currentUrl = url;

    for (let hop = 0; hop <= MAX_WEBHOOK_REDIRECTS; hop++) {
      const response = await fetch(currentUrl, { ...init, redirect: 'manual' });

      if (!REDIRECT_STATUS_CODES.has(response.status)) {
        return response;
      }

      const location = response.headers.get('location');
      if (!location) {
        return response;
      }

      currentUrl = new URL(location, currentUrl);
      await assertSafeWebhookDestination(currentUrl);
    }

    throw new BadRequestException('Too many redirects');
  }

  private historyKey(userId: string): string {
    return `${REDIS_KEY_PREFIX}:${userId}`;
  }

  private async storeEntry(entry: WebhookHistoryEntry): Promise<void> {
    try {
      const key = this.historyKey(entry.userId);
      await this.redisClient.lPush(key, JSON.stringify(entry));
      await this.redisClient.lTrim(key, 0, MAX_HISTORY - 1);
      await this.redisClient.expire(key, REDIS_TTL);
    } catch (err) {
      this.logger.error('Failed to store webhook entry', err);
    }
  }
}
