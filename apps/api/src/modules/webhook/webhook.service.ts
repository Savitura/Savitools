import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, RedisClientType } from 'redis';
import * as crypto from 'crypto';
import { randomUUID } from 'crypto';
import { WEBHOOK_TEMPLATES } from './webhook-templates';
import { SendWebhookDto } from './dto/send-webhook.dto';

export interface WebhookHistoryEntry {
  id: string;
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

const REDIS_KEY = 'webhook_history';
const REDIS_TTL = 86400;
const MAX_HISTORY = 50;

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

  async sendWebhook(dto: SendWebhookDto): Promise<WebhookHistoryEntry> {
    const template = WEBHOOK_TEMPLATES.find(
      (t) => t.eventType === dto.eventType,
    );
    if (!template && !dto.payload) {
      throw new BadRequestException(
        `Unknown event type "${dto.eventType}". Provide a custom payload or use a valid eventType.`,
      );
    }

    const payload = dto.payload ?? template!.samplePayload;

    let signature = '';
    const requestHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (dto.secret) {
      signature = crypto
        .createHmac('sha256', dto.secret)
        .update(JSON.stringify(payload))
        .digest('hex');
      requestHeaders['X-SaviTools-Signature'] = `sha256=${signature}`;
    }

    const startTime = Date.now();
    let statusCode: number | null = null;
    let responseHeaders: Record<string, string> = {};
    let responseBody: unknown = null;
    let error: string | undefined;

    try {
      const response = await fetch(dto.endpointUrl, {
        method: 'POST',
        headers: requestHeaders,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(30000),
      });

      statusCode = response.status;
      responseHeaders = Object.fromEntries(response.headers.entries());

      const contentType = response.headers.get('content-type') ?? '';
      if (contentType.includes('application/json')) {
        responseBody = await response.json();
      } else {
        responseBody = await response.text();
      }
    } catch (err) {
      error = err instanceof Error ? err.message : 'Unknown fetch error';
      this.logger.error(`Webhook delivery failed to ${dto.endpointUrl}`, err);
    }

    const latencyMs = Date.now() - startTime;

    const entry: WebhookHistoryEntry = {
      id: randomUUID(),
      eventType: dto.eventType,
      endpointUrl: dto.endpointUrl,
      payload,
      requestHeaders,
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

  async getHistory(): Promise<WebhookHistoryEntry[]> {
    try {
      const results = await this.redisClient.lRange(REDIS_KEY, 0, -1);
      return results.map((r) => JSON.parse(r) as WebhookHistoryEntry);
    } catch (err) {
      this.logger.error('Failed to fetch webhook history', err);
      return [];
    }
  }

  async replay(id: string): Promise<WebhookHistoryEntry> {
    const history = await this.getHistory();
    const original = history.find((entry) => entry.id === id);

    if (!original) {
      throw new BadRequestException(`Webhook attempt ${id} not found`);
    }

    return this.sendWebhook({
      endpointUrl: original.endpointUrl,
      eventType: original.eventType,
      payload: original.payload,
    });
  }

  private async storeEntry(entry: WebhookHistoryEntry): Promise<void> {
    try {
      await this.redisClient.lPush(REDIS_KEY, JSON.stringify(entry));
      await this.redisClient.lTrim(REDIS_KEY, 0, MAX_HISTORY - 1);
      await this.redisClient.expire(REDIS_KEY, REDIS_TTL);
    } catch (err) {
      this.logger.error('Failed to store webhook entry', err);
    }
  }
}
