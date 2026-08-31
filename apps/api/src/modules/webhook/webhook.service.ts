import { Injectable, Logger } from '@nestjs/common';
import { SendWebhookDto } from './dto/send-webhook.dto';
import { WEBHOOK_TEMPLATES, WebhookTemplate } from './webhook-templates';
import * as crypto from 'crypto';

export interface WebhookHistoryEntry {
  id: string;
  timestamp: number;
  endpointUrl: string;
  eventType: string;
  method: string;
  requestHeaders: Record<string, string>;
  payload: Record<string, unknown>;
  responseStatus: number | null;
  responseHeaders: Record<string, string>;
  responseBody: string;
  latencyMs: number;
  error?: string;
  repeatIndex?: number;
}

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);
  private history: WebhookHistoryEntry[] = [];
  private templates: WebhookTemplate[] = [...WEBHOOK_TEMPLATES];

  getTemplates(): WebhookTemplate[] {
    return this.templates;
  }

  saveTemplate(template: WebhookTemplate): WebhookTemplate {
    const existingIndex = this.templates.findIndex(
      (t) => t.provider === template.provider && t.eventType === template.eventType,
    );
    if (existingIndex >= 0) {
      this.templates[existingIndex] = template;
    } else {
      this.templates.push(template);
    }
    return template;
  }

  async sendWebhook(dto: SendWebhookDto): Promise<WebhookHistoryEntry | WebhookHistoryEntry[]> {
    const repeatCount = dto.repeatCount && dto.repeatCount > 0 ? dto.repeatCount : 1;
    const repeatIntervalMs = dto.repeatIntervalMs ?? 0;
    const method = dto.method ?? 'POST';

    let payload: Record<string, unknown> = {};
    if (dto.payload) {
      payload = dto.payload;
    } else {
      const template = this.templates.find((t) => t.eventType === dto.eventType);
      payload = template ? (template.samplePayload as Record<string, unknown>) : { event: dto.eventType, timestamp: new Date().toISOString() };
    }

    const results: WebhookHistoryEntry[] = [];

    for (let i = 0; i < repeatCount; i++) {
      if (i > 0 && repeatIntervalMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, repeatIntervalMs));
      }

      const startTime = Date.now();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-Webhook-Event': dto.eventType,
        'X-Timestamp': new Date().toISOString(),
        ...(dto.headers ?? {}),
      };

      if (dto.secret) {
        const payloadString = JSON.stringify(payload);
        const signature = crypto
          .createHmac('sha256', dto.secret)
          .update(payloadString)
          .digest('hex');
        headers['X-Webhook-Signature'] = `sha256=${signature}`;
      }

      let responseStatus: number | null = null;
      let responseHeaders: Record<string, string> = {};
      let responseBody = '';
      let errorMessage: string | undefined;

      try {
        const fetchOptions: RequestInit = {
          method,
          headers,
        };
        if (method !== 'GET') {
          fetchOptions.body = JSON.stringify(payload);
        }

        const res = await fetch(dto.endpointUrl, fetchOptions);
        responseStatus = res.status;
        res.headers.forEach((val, key) => {
          responseHeaders[key] = val;
        });
        responseBody = await res.text();
      } catch (err) {
        errorMessage = err instanceof Error ? err.message : 'Network error';
        responseBody = JSON.stringify({ error: errorMessage });
      }

      const latencyMs = Date.now() - startTime;

      const entry: WebhookHistoryEntry = {
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        endpointUrl: dto.endpointUrl,
        eventType: dto.eventType,
        method,
        requestHeaders: headers,
        payload,
        responseStatus,
        responseHeaders,
        responseBody,
        latencyMs,
        error: errorMessage,
        repeatIndex: repeatCount > 1 ? i + 1 : undefined,
      };

      this.history.unshift(entry);
      if (this.history.length > 50) {
        this.history.pop();
      }
      results.push(entry);
    }

    return repeatCount > 1 ? results : results[0];
  }

  getHistory(): WebhookHistoryEntry[] {
    return this.history;
  }

  async replayWebhook(id: string): Promise<WebhookHistoryEntry> {
    const entry = this.history.find((h) => h.id === id);
    if (!entry) {
      throw new Error('Webhook history entry not found');
    }
    const res = (await this.sendWebhook({
      endpointUrl: entry.endpointUrl,
      eventType: entry.eventType,
      payload: entry.payload,
      method: entry.method as any,
      headers: entry.requestHeaders,
    })) as WebhookHistoryEntry;
    return res;
  }
}
