import { createHmac } from 'crypto';
import {
  DEFAULT_MAX_AGE_SECONDS,
  DEFAULT_MAX_SKEW_SECONDS,
  SIGNATURE_HEADER,
  TIMESTAMP_HEADER,
  signBody,
  verifySignature,
} from './signature';

const SECRET = 'whsec_test-secret-123';
const BODY = JSON.stringify({ event: 'campaign.funded', amount: '1000' });
const TS = 1_700_000_000; // fixed clock for deterministic tests

describe('signBody', () => {
  it('emits sha256=<64 hex chars> covering `<timestamp>.<body>`', () => {
    const { signature, timestamp } = signBody({ secret: SECRET, body: BODY, timestamp: TS });

    expect(timestamp).toBe(String(TS));
    expect(signature).toMatch(/^sha256=[0-9a-f]{64}$/);

    const expected = createHmac('sha256', SECRET).update(`${TS}.${BODY}`).digest('hex');
    expect(signature).toBe(`sha256=${expected}`);
  });

  it('signs the exact body bytes sent over the wire', () => {
    const { signature } = signBody({ secret: SECRET, body: BODY, timestamp: TS });
    // A different-but-similar body must not verify against this signature.
    const tampered = signBody({ secret: SECRET, body: `${BODY} `, timestamp: TS });
    expect(tampered.signature).not.toBe(signature);
  });

  it('accepts a Buffer body and hashes its raw bytes', () => {
    const bodyBuffer = Buffer.from(BODY, 'utf8');
    const { signature } = signBody({ secret: SECRET, body: bodyBuffer, timestamp: TS });

    const expected = createHmac('sha256', SECRET)
      .update(`${TS}.`)
      .update(bodyBuffer)
      .digest('hex');
    expect(signature).toBe(`sha256=${expected}`);
  });

  it('defaults the timestamp to the current Unix second', () => {
    const before = Math.floor(Date.now() / 1000);
    const { timestamp } = signBody({ secret: SECRET, body: BODY });
    const after = Math.floor(Date.now() / 1000);

    expect(Number(timestamp)).toBeGreaterThanOrEqual(before);
    expect(Number(timestamp)).toBeLessThanOrEqual(after);
  });

  it('produces different signatures for different secrets and timestamps', () => {
    const a = signBody({ secret: SECRET, body: BODY, timestamp: TS });
    const b = signBody({ secret: 'other-secret', body: BODY, timestamp: TS });
    const c = signBody({ secret: SECRET, body: BODY, timestamp: TS + 1 });

    expect(a.signature).not.toBe(b.signature);
    expect(a.signature).not.toBe(c.signature);
  });
});

describe('verifySignature', () => {
  it('accepts a freshly signed, correctly formatted request', () => {
    const { signature, timestamp } = signBody({ secret: SECRET, body: BODY, timestamp: TS });

    expect(verifySignature({ secret: SECRET, body: BODY, signature, timestamp, now: TS })).toEqual({
      valid: true,
    });
  });

  it('verifies within the replay window at the exact max-age boundary', () => {
    const { signature, timestamp } = signBody({ secret: SECRET, body: BODY, timestamp: TS });

    expect(
      verifySignature({
        secret: SECRET,
        body: BODY,
        signature,
        timestamp,
        now: TS + DEFAULT_MAX_AGE_SECONDS,
      }),
    ).toEqual({ valid: true });
  });

  describe('failure paths', () => {
    it('rejects a missing signature header', () => {
      expect(
        verifySignature({ secret: SECRET, body: BODY, signature: undefined, timestamp: String(TS), now: TS }),
      ).toEqual({ valid: false, reason: 'missing-signature' });
    });

    it('rejects an empty signature header as missing', () => {
      expect(
        verifySignature({ secret: SECRET, body: BODY, signature: '', timestamp: String(TS), now: TS }),
      ).toEqual({ valid: false, reason: 'missing-signature' });
    });

    it('rejects a missing timestamp header', () => {
      const { signature } = signBody({ secret: SECRET, body: BODY, timestamp: TS });
      expect(
        verifySignature({ secret: SECRET, body: BODY, signature, timestamp: undefined, now: TS }),
      ).toEqual({ valid: false, reason: 'missing-timestamp' });
    });

    it('rejects a non-numeric timestamp', () => {
      const { signature } = signBody({ secret: SECRET, body: BODY, timestamp: TS });
      for (const bad of ['now', '17:00:00', '12.5', '-5']) {
        expect(
          verifySignature({ secret: SECRET, body: BODY, signature, timestamp: bad, now: TS }),
        ).toEqual({ valid: false, reason: 'malformed-timestamp' });
      }
    });

    it('rejects a signature older than the replay window (replay attack)', () => {
      const { signature, timestamp } = signBody({ secret: SECRET, body: BODY, timestamp: TS });

      expect(
        verifySignature({
          secret: SECRET,
          body: BODY,
          signature,
          timestamp,
          now: TS + DEFAULT_MAX_AGE_SECONDS + 1,
        }),
      ).toEqual({ valid: false, reason: 'expired' });
    });

    it('rejects a timestamp implausibly far in the future (sender clock skew)', () => {
      const { signature, timestamp } = signBody({ secret: SECRET, body: BODY, timestamp: TS });

      expect(
        verifySignature({
          secret: SECRET,
          body: BODY,
          signature,
          timestamp,
          now: TS - DEFAULT_MAX_SKEW_SECONDS - 1,
        }),
      ).toEqual({ valid: false, reason: 'future' });
    });

    it('accepts a timestamp within the allowed clock skew', () => {
      const { signature, timestamp } = signBody({ secret: SECRET, body: BODY, timestamp: TS });

      expect(
        verifySignature({
          secret: SECRET,
          body: BODY,
          signature,
          timestamp,
          now: TS - DEFAULT_MAX_SKEW_SECONDS,
        }),
      ).toEqual({ valid: true });
    });

    it('rejects a signature computed with the wrong secret', () => {
      const { signature, timestamp } = signBody({ secret: SECRET, body: BODY, timestamp: TS });

      expect(
        verifySignature({ secret: 'wrong-secret', body: BODY, signature, timestamp, now: TS }),
      ).toEqual({ valid: false, reason: 'invalid-signature' });
    });

    it('rejects a signature computed over a tampered body', () => {
      const { signature, timestamp } = signBody({ secret: SECRET, body: BODY, timestamp: TS });

      expect(
        verifySignature({ secret: SECRET, body: `${BODY}x`, signature, timestamp, now: TS }),
      ).toEqual({ valid: false, reason: 'invalid-signature' });
    });

    it('rejects a signature computed over a different timestamp', () => {
      const { signature } = signBody({ secret: SECRET, body: BODY, timestamp: TS });

      expect(
        verifySignature({ secret: SECRET, body: BODY, signature, timestamp: String(TS + 1), now: TS + 1 }),
      ).toEqual({ valid: false, reason: 'invalid-signature' });
    });

    it('rejects a malformed signature value', () => {
      const { timestamp } = signBody({ secret: SECRET, body: BODY, timestamp: TS });
      const malformed = ['sha256=', 'sha256=not-hex', 'sha256=abcd', 'v1=abcd'];

      for (const signature of malformed) {
        expect(
          verifySignature({ secret: SECRET, body: BODY, signature, timestamp, now: TS }),
        ).toEqual({ valid: false, reason: 'invalid-signature' });
      }
    });

    it('rejects a truncated signature (63 hex chars)', () => {
      const { signature, timestamp } = signBody({ secret: SECRET, body: BODY, timestamp: TS });
      const truncated = `sha256=${signature.slice('sha256='.length, -1)}`;

      expect(
        verifySignature({ secret: SECRET, body: BODY, signature: truncated, timestamp, now: TS }),
      ).toEqual({ valid: false, reason: 'invalid-signature' });
    });
  });

  it('never throws when presented arbitrary garbage (constant-time path)', () => {
    expect(() =>
      verifySignature({
        secret: SECRET,
        body: BODY,
        signature: 'sha256=zzzz',
        timestamp: 'nope',
        now: TS,
      }),
    ).not.toThrow();
  });
});

describe('header constants', () => {
  it('matches the documented wire format names', () => {
    expect(SIGNATURE_HEADER).toBe('X-SaviTools-Signature');
    expect(TIMESTAMP_HEADER).toBe('X-SaviTools-Timestamp');
  });
});