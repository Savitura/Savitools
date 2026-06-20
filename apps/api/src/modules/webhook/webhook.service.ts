import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { createHmac, randomBytes } from 'crypto';
import { Repository } from 'typeorm';
import { FireEventDto } from './dto/fire-event.dto';
import { RegisterEndpointDto } from './dto/register-endpoint.dto';
import { WebhookDelivery } from './entities/webhook-delivery.entity';
import { WebhookEndpoint } from './entities/webhook-endpoint.entity';
import {
  WEBHOOK_EVENT_META,
  WEBHOOK_SAMPLE_PAYLOADS,
} from './webhook-samples';

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);

  constructor(
    @InjectRepository(WebhookEndpoint)
    private readonly endpointsRepository: Repository<WebhookEndpoint>,
    @InjectRepository(WebhookDelivery)
    private readonly deliveriesRepository: Repository<WebhookDelivery>,
    private readonly configService: ConfigService,
  ) {}

  async register(dto: RegisterEndpointDto): Promise<{
    id: string;
    url: string;
    events: string[];
    secret: string;
    createdAt: Date;
  }> {
    const invalid = dto.events.filter((e) => !WEBHOOK_EVENT_META[e]);
    if (invalid.length > 0) {
      throw new BadRequestException(
        `Invalid event type(s): ${invalid.join(', ')}. Valid types: ${Object.keys(WEBHOOK_EVENT_META).join(', ')}`,
      );
    }

    const secret =
      this.configService.get<string>('WEBHOOK_SIGNING_SECRET') || randomBytes(32).toString('hex');

    const endpoint = this.endpointsRepository.create({
      url: dto.url,
      events: dto.events,
      secret,
    });

    const saved = await this.endpointsRepository.save(endpoint);
    return {
      id: saved.id,
      url: saved.url,
      events: saved.events,
      secret: saved.secret,
      createdAt: saved.createdAt,
    };
  }

  async findAll(): Promise<WebhookEndpoint[]> {
    return this.endpointsRepository.find({ order: { createdAt: 'DESC' } });
  }

  async findOne(id: string): Promise<WebhookEndpoint> {
    const endpoint = await this.endpointsRepository.findOne({ where: { id } });
    if (!endpoint) {
      throw new NotFoundException(`Webhook endpoint ${id} not found`);
    }
    return endpoint;
  }

  async remove(id: string): Promise<{ success: boolean }> {
    const endpoint = await this.findOne(id);
    await this.endpointsRepository.remove(endpoint);
    return { success: true };
  }

  async fireEvent(
    endpointId: string,
    dto: FireEventDto,
  ): Promise<{
    eventType: string;
    payload: Record<string, unknown>;
    signature: string;
    responseStatus: number;
    responseBody: string;
    latencyMs: number;
  }> {
    const endpoint = await this.findOne(endpointId);

    if (!endpoint.events.includes(dto.eventType)) {
      throw new BadRequestException(
        `Endpoint is not subscribed to event type "${dto.eventType}". Subscribed events: ${endpoint.events.join(', ')}`,
      );
    }

    const payload = WEBHOOK_SAMPLE_PAYLOADS[dto.eventType];
    if (!payload) {
      throw new BadRequestException(
        `Unknown event type: ${dto.eventType}. Valid types: ${Object.keys(WEBHOOK_SAMPLE_PAYLOADS).join(', ')}`,
      );
    }

    const payloadBody = JSON.stringify(payload);
    const signature = createHmac('sha256', endpoint.secret)
      .update(payloadBody)
      .digest('hex');

    const signingHeader = `t=${Date.now()},s=${signature}`;

    const start = Date.now();
    let responseStatus: number;
    let responseBody: string;

    try {
      const response = await fetch(endpoint.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Savitura-Signature': signingHeader,
          'X-Savitura-Event': dto.eventType,
          'User-Agent': 'SaviTools-Webhook-Tester/1.0',
        },
        body: payloadBody,
        signal: AbortSignal.timeout(10_000),
      });

      responseStatus = response.status;
      responseBody = await response.text();
    } catch (error) {
      responseStatus = 0;
      responseBody = `Delivery failed: ${error instanceof Error ? error.message : 'Connection error'}`;
    }

    const latencyMs = Date.now() - start;

    await this.deliveriesRepository.save(
      this.deliveriesRepository.create({
        endpointId: endpoint.id,
        eventType: dto.eventType,
        payload,
        signature,
        responseStatus,
        responseBody,
        latencyMs,
      }),
    );

    return {
      eventType: dto.eventType,
      payload,
      signature,
      responseStatus,
      responseBody,
      latencyMs,
    };
  }

  async getDeliveries(
    endpointId: string,
  ): Promise<
    Array<{
      id: string;
      eventType: string;
      payload: Record<string, unknown>;
      signature: string;
      responseStatus: number;
      responseBody: string;
      latencyMs: number;
      createdAt: Date;
    }>
  > {
    const endpoint = await this.findOne(endpointId);

    const deliveries = await this.deliveriesRepository.find({
      where: { endpointId: endpoint.id },
      order: { createdAt: 'DESC' },
      take: 50,
    });

    return deliveries.map((d) => ({
      id: d.id,
      eventType: d.eventType,
      payload: d.payload,
      signature: d.signature,
      responseStatus: d.responseStatus,
      responseBody: d.responseBody,
      latencyMs: d.latencyMs,
      createdAt: d.createdAt,
    }));
  }

  getEventTypes(): Array<{
    type: string;
    provider: string;
    label: string;
    description: string;
    samplePayload: Record<string, unknown>;
  }> {
    return Object.entries(WEBHOOK_EVENT_META).map(([type, meta]) => ({
      type,
      ...meta,
      samplePayload: WEBHOOK_SAMPLE_PAYLOADS[type],
    }));
  }
}
