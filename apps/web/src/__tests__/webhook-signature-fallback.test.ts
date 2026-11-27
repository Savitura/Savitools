import { describe, it, expect, afterEach } from '@jest/globals';
import { signPayload, canonicalRequestBody, signedPayload } from '@/lib/webhook-signature';

describe('webhook-signature edge cases and WebCrypto fallback', () => {
  const originalCrypto = globalThis.crypto;

  afterEach(() => {
    globalThis.crypto = originalCrypto;
  });

  it('returns null gracefully when WebCrypto subtle crypto is missing', async () => {
    // @ts-expect-error simulating missing subtle crypto
    globalThis.crypto = {
      subtle: undefined,
    };

    const result = await signPayload('secret', 1700000000, 'body');
    expect(result).toBeNull();
  });

  it('handles HMAC signature verification and generation correctly', async () => {
    const body = canonicalRequestBody({ hello: 'world' });
    const timestamp = 1700000000;
    const payloadToSign = signedPayload(timestamp, body);
    expect(payloadToSign).toBe('1700000000.{"hello":"world"}');

    const sig = await signPayload('my-secret', timestamp, body);
    expect(sig).toMatch(/^sha256=[a-f0-9]{64}$/);

    const sig2 = await signPayload('different-secret', timestamp, body);
    expect(sig2).not.toBe(sig);
  });
});
