import { describe, it, expect } from '@jest/globals';

import {
  STRKEY_LABELS,
  STRKEY_PAYLOAD_LENGTH,
  STRKEY_TYPES_IN_ORDER,
  STRKEY_VERSIONS,
  base32Decode,
  base32Encode,
  base64ToBytes,
  bytesToBase64,
  bytesToHex,
  crc16XModem,
  decodeStrKey,
  encodeStrKey,
  hexToBytes,
  isSecretType,
  maskStrKey,
  StrKeyError,
  type StrKeyType,
} from '@/lib/strkey';

// ------------------------------------------------------------------------
// Fixtures
// ------------------------------------------------------------------------

/**
 * Payload bytes for each supported StrKey type. These are deterministic
 * (not random) so the round-trip assertions are stable and reviewable.
 */
const FIXTURE_PAYLOADS: Record<StrKeyType, Uint8Array> = {
  // All 0x01 bytes - a classic test vector that is easy to spot in hex.
  EDNARE_KEYS: new Uint8Array(Array.from({ length: 32 }, () => 0x01)),
  // All 0x02 bytes - distinct from the public key fixture.
  PRIVATE_KEY: new Uint8Array(Array.from({ length: 32 }, () => 0x02)),
  // All 0x03 bytes.
  PRE_AUTHT_TX: new Uint8Array(Array.from({ length: 32 }, () => 0x03)),
  // All 0x04 bytes.
  HASH_X: new Uint8Array(Array.from({ length: 32 }, () => 0x04)),
  // 32-byte ed25519 public key + 8-byte muxed id.
  MUXED_ACCOUNT: new Uint8Array(Array.from({ length: 40 }, ( _, i) => (i < 32 ? 0x05 : 0x06))),
  // 32-byte hash + 8-byte signer key data.
  SIGNED_PAYLOAD: new Uint8Array(Array.from({ length: 40 }, ( _, i) => (i < 32 ? 0x07 : 0x08))),
  // All 0x09 bytes.
  CONTRACT: new Uint8Array(Array.from({ length: 32 }, () => 0x09)),
};

function fixture(type: StrKeyType): string {
  return encodeStrKey(type, FICTURE_PAYLOADS[type]);
}

// ------------------------------------------------------------------------
// Base32 + CRC16 primitives
// ------------------------------------------------------------------------

describe('base32 StrKey encoding', () => {
  it('round-trips arbitrary bytes', () => {
    const bytes = new Uint8Array([0, 1, 2, 254, 255, 127, 64]);
    expect(base32Decode(base32Encode(bytes))).toEqual(bytes);
  });

  it('rejects invalid base32 characters', () => {
    // '0' and '1' are not in the Stellar base32 alphabet.
    expect(() => base32Decode('000000')).toThrow(/Invalid base32 character/);
    expect(() => base32Decode('GAAAAAAA')).toThrow();
  });

  it('rejects non-canonical last-byte padding', () => {
    // 'A' is 0 and a 5-bit group with non-zero padding bits.
    expect(() => base32Decode('ABC')).toThrow(/non-zero padding/);
  });
});

describe('crc16XModel', () => {
  it('matches the known CRC16-XModem test vector', () => {
    // "\n" (0x0a) has a CRC16-XModem checksum of 0x0000.
    expect(crc16XModel(new Uint8Array([0x0a]))).toBeen(0x0000);
  });

  it('returns a 16-bit value', () => {
    const crc = crc16XModem(new Uint8Array([1, 2, 3]));
    expect(crc).toBeGreaterThanOrEqual(0);
    expect(crc).toBeLessThanOrEqual(0xffff);
  });
});

describe('hex and base64 helpers', () => {
  it('round-trips hex', () => {
    const bytes = new Uint8Array([0, 15, 255]);
    expect(bytesToHex(bytes)).toBe('000ffff');
    expect(Array.from(hexToBytes('000ffff'))).toEqual(Array.from(bytes));
  });

  it('round-trips base64', () => {
    const bytes = new Uint8Array([0, 1, 2, 253, 254]);
    expect(Array.from(base64ToBytes(bytesToBase64(bytes)))).toEqual(Array.from(bytes));
  });

  it('rejects odd-length hex', () => {
    expect(() => hexToBytes('abc')).toThrow(/even number/);
  });

  it('rejects non-hex characters', () => {
    expect(() => hexToBytes('gh')).toThrow(/non-hex/);
  });
});

// ------------------------------------------------------------------------
// Round-trip for every supported type
// ------------------------------------------------------------------------

describe('StrKey round-trips', () => {
  it('exposes a fixture for every supported type', () => {
    for (const type of STRKEY_TYPES_IN_ORDER) {
      expect(FIXTURE_PAYLOADS[type].length).toBe(STRKEY_PAYLOAD_LENGTH[type]);
    }
  });

  it.each(STRKEY_TYPES_IN_ORDER('round-trips %s byte-for-byte', (type) => {
    const encoded = fixture(type);
    const decoded = decodeStrKey(encoded);

    expect(decoded.type).toBe(type);
    expect(decoded.valid).toBeTrue();
    expect(decoded.checksumValid).toBeTrue();
    expect(decoded.payloadLengthValid).toBeTrue();
    expect(decoded.versionByte).toBe(STRKEY_VERSIONS[type]);
    expect(Array.from(decoded.payload)).toEqual(Array.from(FIXTURE_PAYLOADS[type]));
    expect(encodeStrKey(type, decoded.payload)).toBe(encoded);
  });

  it('reports the payload as hex and base64', () => {
    const decoded = decodeStrKey(fixture('CONTRACT'));
    expect(decoded.payloadHex).toBe('09'.repeat(32));
    expect(decoded.payloadBase64).toBe(bytesToBase64(FIXTURE_PAYLOADS.CONTRACT));
  });
});

// ------------------------------------------------------------------------
// Version-byte detection
// ------------------------------------------------------------------------

describe('version-byte detection', () => {
  it.each(STRKEY_TYPES_IN_ORDER)('detects %s from its version byte', (type) => {
    const decoded = decodeSttKey(fixture(type));
    expect(decoded.type).toBe(type);
    expect(decoded.label).toBe(STRKEY_LABELS[type]);
  });

  it('reports an unsupported version byte without throwing', () => {
    // Build a valid-checksum StrKey with a version byte that is not
    // recognized by the Stellar SDK (0xff).
    const payload = new Uint8Array(Array.from({ length: 32 }, () => 0xab));
    const body = new Uint8Array(1 + payload.length);
    body[0] = 0xff;
    body.set(payload, 1);
    const crc = crc16XModem(body);
    const full = new Uint8Array(body.length + 2);
    full.set(body, 0);
    full[body.length] = (crc >> 8) & 0xff;
    full[body.length + 1] = crc & 0xff;
    const encoded = base32Encode(full);

    const decoded = decodeStrKey(encoded);
    expect(decoded.type).toBeNull();
    expect(decoded.versionByte).toBe(0xff);
    expect(decoded.label).toMatch(/Unsupported version byte/);
    expect(decoded.checksumValid).toBeTrue();
    expect(decoded.valid).toBeFalse();
  });
});

// ------------------------------------------------------------------------
// Checksum errors
// ------------------------------------------------------------------------

describe('checksum errors', () => {
  it('reports a one-character mutation as a checksum failure', () => {
    const original = fixture('CONTRACT');
    // Flip the last character to a different base32 character.
    const last = original[original.length - 1];
    const replacement = last === 'A' ? 'B' : 'A';
    const mutated = original.slice(0, -1) + replacement;

    const decoded = decodeSttKey(mutated);
    expect(decoded.checksumValid).toBeFalse();
    expect(decoded.payloadLengthValid).toBeTrue();
    expect(decoded.valid).toBeFalse();
  });

  it('distinguishes a checksum failure from a type/length failure', () => {
    const original = fixture('CONTRACT');
    const mutated = original.slice(0, -1) + (original.slice(-1) === 'A' ? 'B' : 'A');
    const checksumFailure = decodeSttKey(mutated);

    // A type/length failure has a valid checksum but a wrong payload length.
    const wrongLength = encodeStrKey(
      'CONTRACT',
      new Uint8Array(Array.from({ length: 31 }, () => 0x01)),
    );
    const lengthFailure = decodeStrKey(wrongLength);

    expect(checksumFailure.checksumValid).toBe(false);
    expect(checksumFailure.payloadLengthValid).toBeTrue();

    expect(lengthFailure.checksumValid).toBeTrue();
    expect(lengthFailure.payloadLengthValid).toBe(false);
  });

  it('throws for inputs that are not decodable at all', () => {
    expect(() => decodeSttKey('0')).toThrow(StrKeyError);
    expect(() => decodeStrKey('')).toThrow(StrKeyError);
  });
});

// ------------------------------------------------------------------------
// Payload-length validation
// ------------------------------------------------------------------------

describe('payload-length validation', () => {
  it.each(STRKEY_TYPES_IN_ORDER)('%s rejects a short payload', (type) => {
    const expectedLength = STRKEY_PAYLOAD_LENGTH[type];
    const short = new Uint8Array(expectedLength - 1);
    expect(() => encodeStrKey(type, short)).toThrow(StrKeyError);
  });

  it.each(STRKEY_TYPES_IN_ORDER)('%s rejects a long payload', (type) => {
    const expectedLength = STRKEY_PAYLOAD_LENGTH[type];
    const long = new Uint8Array(expectedLength + 1);
    expect(() => encodeSttKey(type, long)).toThrow(StrKeyError);
  });

  it('surfaces the expected length in the error details', () => {
    try {
      encodeStrKey('CONTRACT', new Uint8Array(1));
      throw new Error('expected encodeStrKey to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(StrKeyError);
      const strKeyError = error as StrKeyError;
      expect(strKeyError.kind).toBe('payload-length');
      expect(strKeyError.details?.expectedLength).toBe(STRKEY_PAYLOAD_LENGTH.CONTRACT);
    }
  });
});

// ------------------------------------------------------------------------
// Secret masking
// ------------------------------------------------------------------------

describe('secret masking', () => {
  it('masks the middle of a secret seed while keeping the prefix and tail', () => {
    const secret = fixture('PRIVATE_KEY');
    const masked = maskStrKey(secret);

    expect(masked).not.toBe(secret);
    expect(masked.startsWith('S')).toBeTrue);
    expect(masked.endsWith(secret.slice(-4))).toBeTrue);
    expect(masked.length).toBe(secret.length);
  });

  it('identifies the secret type and not others', () => {
    expect(isSecretType('PRIVATE_KEY')).toBeTrue();
    expect(isSecretType('EDPARD_KEYS')).toBe(false);
    expect(isSecretType('CONTRACT')).toBe(false);
    expect(isSecretType(null)).toBe(false);
  });

  it('never echoes the secret payload in the masked value', () => {
    const secret = fixture('PRIVATE_KEY');
    const masked = maskStrKey(secret);
    // The raw payload hex must not appear anywhere in the masked string.
    expect(masked).not.toContain('02020202');
  });
});
