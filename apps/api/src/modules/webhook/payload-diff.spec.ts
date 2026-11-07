import { Test, TestingModule } from '@nestjs/testing';
import { WebhookService } from './webhook.service';

describe('WebhookService - Payload Diffing', () => {
  let service: WebhookService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [WebhookService],
    }).compile();

    service = module.get<WebhookService>(WebhookService);
  });

  describe('computePayloadDiff', () => {
    it('should detect added fields', () => {
      const previous = { id: 1, name: 'John' };
      const current = { id: 1, name: 'John', email: 'john@example.com' };

      const diff = (service as any).computePayloadDiff(previous, current);

      expect(diff).toBeDefined();
      expect(diff?.added).toEqual({ email: 'john@example.com' });
      expect(diff?.modified).toBeUndefined();
      expect(diff?.removed).toBeUndefined();
    });

    it('should detect modified fields', () => {
      const previous = { id: 1, name: 'John', status: 'pending' };
      const current = { id: 1, name: 'Jane', status: 'pending' };

      const diff = (service as any).computePayloadDiff(previous, current);

      expect(diff).toBeDefined();
      expect(diff?.modified).toEqual({
        name: { from: 'John', to: 'Jane' },
      });
      expect(diff?.added).toBeUndefined();
      expect(diff?.removed).toBeUndefined();
    });

    it('should detect removed fields', () => {
      const previous = { id: 1, name: 'John', tempData: 'xyz' };
      const current = { id: 1, name: 'John' };

      const diff = (service as any).computePayloadDiff(previous, current);

      expect(diff).toBeDefined();
      expect(diff?.removed).toEqual({ tempData: 'xyz' });
      expect(diff?.added).toBeUndefined();
      expect(diff?.modified).toBeUndefined();
    });

    it('should detect multiple types of changes', () => {
      const previous = { id: 1, name: 'John', status: 'pending', oldField: 'data' };
      const current = { id: 1, name: 'Jane', status: 'pending', newField: 'info' };

      const diff = (service as any).computePayloadDiff(previous, current);

      expect(diff).toBeDefined();
      expect(diff?.added).toEqual({ newField: 'info' });
      expect(diff?.modified).toEqual({
        name: { from: 'John', to: 'Jane' },
      });
      expect(diff?.removed).toEqual({ oldField: 'data' });
    });

    it('should return undefined when payloads are identical', () => {
      const previous = { id: 1, name: 'John', status: 'active' };
      const current = { id: 1, name: 'John', status: 'active' };

      const diff = (service as any).computePayloadDiff(previous, current);

      expect(diff).toBeUndefined();
    });

    it('should handle nested objects', () => {
      const previous = {
        id: 1,
        user: { name: 'John', email: 'john@example.com' },
      };
      const current = {
        id: 1,
        user: { name: 'Jane', email: 'john@example.com' },
      };

      const diff = (service as any).computePayloadDiff(previous, current);

      expect(diff).toBeDefined();
      expect(diff?.modified).toEqual({
        user: {
          from: { name: 'John', email: 'john@example.com' },
          to: { name: 'Jane', email: 'john@example.com' },
        },
      });
    });

    it('should handle arrays as values', () => {
      const previous = { id: 1, tags: ['a', 'b'] };
      const current = { id: 1, tags: ['a', 'b', 'c'] };

      const diff = (service as any).computePayloadDiff(previous, current);

      expect(diff).toBeDefined();
      expect(diff?.modified).toEqual({
        tags: { from: ['a', 'b'], to: ['a', 'b', 'c'] },
      });
    });

    it('should handle null and undefined values', () => {
      const previous = { id: 1, value: null, other: 'data' };
      const current = { id: 1, value: undefined, other: 'data' };

      const diff = (service as any).computePayloadDiff(previous, current);

      expect(diff).toBeDefined();
      expect(diff?.modified?.value).toBeDefined();
    });
  });

  describe('deepEqual', () => {
    it('should return true for identical primitives', () => {
      expect((service as any).deepEqual(1, 1)).toBe(true);
      expect((service as any).deepEqual('test', 'test')).toBe(true);
      expect((service as any).deepEqual(true, true)).toBe(true);
    });

    it('should return false for different primitives', () => {
      expect((service as any).deepEqual(1, 2)).toBe(false);
      expect((service as any).deepEqual('test', 'other')).toBe(false);
      expect((service as any).deepEqual(true, false)).toBe(false);
    });

    it('should return true for identical objects', () => {
      const obj = { a: 1, b: 'test', c: { nested: true } };
      expect((service as any).deepEqual(obj, { a: 1, b: 'test', c: { nested: true } })).toBe(true);
    });

    it('should return false for different objects', () => {
      expect((service as any).deepEqual({ a: 1 }, { a: 2 })).toBe(false);
      expect((service as any).deepEqual({ a: 1 }, { b: 1 })).toBe(false);
      expect((service as any).deepEqual({ a: 1, b: 2 }, { a: 1 })).toBe(false);
    });

    it('should handle null and undefined', () => {
      expect((service as any).deepEqual(null, null)).toBe(true);
      expect((service as any).deepEqual(undefined, undefined)).toBe(true);
      expect((service as any).deepEqual(null, undefined)).toBe(false);
      expect((service as any).deepEqual(null, 0)).toBe(false);
    });
  });
});
