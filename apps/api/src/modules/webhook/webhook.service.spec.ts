import { Test, TestingModule } from '@nestjs/testing';
import { WebhookService } from './webhook.service';

describe('WebhookService', () => {
  let service: WebhookService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [WebhookService],
    }).compile();

    service = module.get<WebhookService>(WebhookService;
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should return templates', () => {
    const templates = service.getTemplates();
    expect(templates.length).toBeGreaterThan(0);
  });

  it('should save and retrieve templates', () => {
    const customTemplate = {
      provider: 'crowdpay' as const,
      eventType: 'custom.event',
      description: 'Custom event test',
      schema: { test: 'string' },
      samplePayload: { test: true },
    };
    service.saveTemplate(customTemplate);
    const found = service.getTemplates().find((t) => t.eventType === 'custom.event');
    expect(found).toBeDefined();
    expect(found?.samplePayload).toEqual({ test: true });
  });
});
