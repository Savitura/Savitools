import { WEBHOOK_TEMPLATES } from './webhook-templates';

describe('WebhookTemplates', () => {
  it('should define valid templates with providers and schemas', () => {
    expect(Array.isArray(WEBHOOK_TEMPLATES)).toBe(true);
    expect(WEBHOOK_TEMPLATES.length).toBeGreaterThan(0);
    for (const template of WEBHOOK_TEMPLATES) {
      expect(template.provider).toBeDefined();
      expect(template.eventType).toBeDefined();
      expect(template.description).toBeDefined();
      expect(template.schema).toBeDefined();
      expect(template.samplePayload).toBeDefined();
    }
  });
});
