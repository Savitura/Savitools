import { describe, it, expect } from '@jest/globals';
import {
  WEBHOOK_METHODS,
  DEFAULT_WEBHOOK_METHOD,
  isWebhookMethod,
  parseWebhookMethod,
  restoreWebhookMethod,
} from '@/lib/webhook-method';

describe('webhook-method', () => {
  it('includes expected default methods', () => {
    expect(WEBHOOK_METHODS).toContain('POST');
    expect(WEBHOOK_METHODS).toContain('PUT');
    expect(WEBHOOK_METHODS).toContain('PATCH');
    expect(WEBHOOK_METHODS).toContain('GET');
    expect(DEFAULT_WEBHOOK_METHOD).toBe('POST');
  });

  it('correctly identifies valid webhook methods', () => {
    expect(isWebhookMethod('POST')).toBe(true);
    expect(isWebhookMethod('post')).toBe(true);
    expect(isWebhookMethod('PUT')).toBe(true);
    expect(isWebhookMethod('INVALID')).toBe(false);
    expect(isWebhookMethod(123)).toBe(false);
    expect(isWebhookMethod(null)).toBe(false);
  });

  it('parses methods correctly with fallback', () => {
    expect(parseWebhookMethod('put')).toBe('PUT');
    expect(parseWebhookMethod('UNKNOWN')).toBe('POST');
    expect(parseWebhookMethod(undefined)).toBe('POST');
  });

  it('restores webhook methods with warnings for unsupported values', () => {
    expect(restoreWebhookMethod('POST')).toEqual({ method: 'POST', warning: null });
    expect(restoreWebhookMethod(undefined)).toEqual({ method: 'POST', warning: null });
    expect(restoreWebhookMethod(null)).toEqual({ method: 'POST', warning: null });
    expect(restoreWebhookMethod('')).toEqual({ method: 'POST', warning: null });

    const restored = restoreWebhookMethod('DELETE');
    expect(restored.method).toBe('POST');
    expect(restored.warning).toContain('DELETE');
  });
});
