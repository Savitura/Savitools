import {
  DEFAULT_WEBHOOK_METHOD,
  WEBHOOK_METHODS,
  isWebhookMethod,
  parseWebhookMethod,
  restoreWebhookMethod,
} from '@/lib/webhook-method';

describe('webhook method contract', () => {
  it.each(WEBHOOK_METHODS)('accepts the supported method %s', (method) => {
    expect(isWebhookMethod(method)).toBe(true);
    expect(parseWebhookMethod(method)).toBe(method);
  });

  it('normalises a saved lower-case method for the request sender', () => {
    expect(parseWebhookMethod('patch')).toBe('PATCH');
  });

  it.each(['DELETE', 'HEAD', 'post ', 42, {}, null])(
    'falls back safely for unsupported saved value %p',
    (value) => {
      const restored = restoreWebhookMethod(value);
      if (value === null) {
        expect(restored).toEqual({ method: DEFAULT_WEBHOOK_METHOD, warning: null });
      } else {
        expect(restored.method).toBe(DEFAULT_WEBHOOK_METHOD);
        expect(restored.warning).toContain('is not supported');
      }
    },
  );

  it('restores a supported history method without warning', () => {
    expect(restoreWebhookMethod('PUT')).toEqual({ method: 'PUT', warning: null });
  });

  it('treats a missing history method as a normal POST fallback', () => {
    expect(restoreWebhookMethod(undefined)).toEqual({
      method: DEFAULT_WEBHOOK_METHOD,
      warning: null,
    });
  });
});
