import { Keypair, StrKey } from '@stellar/stellar-sdk';
import {
  STRKEY_CSV_HEADER,
  maskSecretStrKey,
  strKeyBatchToCsv,
  validateStrKey,
  validateStrKeyBatch,
} from './strkey-validation';

const keypair = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 1));
const PUBLIC_KEY = keypair.publicKey();
const SECRET = keypair.secret();
const CONTRACT = StrKey.encodeContract(Buffer.alloc(32, 2));
const PRE_AUTH = StrKey.encodePreAuthTx(Buffer.alloc(32, 3));
const HASH_X = StrKey.encodeSha256Hash(Buffer.alloc(32, 4));
const MUXED = StrKey.encodeMed25519PublicKey(Buffer.alloc(40, 5));

/** Change the last character so the checksum no longer matches. */
function corrupt(value: string): string {
  const last = value[value.length - 1];
  return value.slice(0, -1) + (last === 'A' ? 'B' : 'A');
}

describe('validateStrKey', () => {
  it.each([
    [PUBLIC_KEY, 'ed25519_public_key'],
    [CONTRACT, 'contract'],
    [PRE_AUTH, 'pre_auth_tx'],
    [HASH_X, 'sha256_hash'],
    [MUXED, 'muxed_account'],
  ])('accepts %s as %s', (input, keyType) => {
    expect(validateStrKey(input)).toEqual({
      index: 0,
      input,
      redacted: false,
      valid: true,
      keyType,
      error: null,
    });
  });

  it('trims surrounding whitespace before validating', () => {
    const result = validateStrKey(`  ${PUBLIC_KEY}\t`);
    expect(result.valid).toBe(true);
    expect(result.input).toBe(PUBLIC_KEY);
  });

  it('reports each failure with its own reason code', () => {
    expect(validateStrKey('   ').error?.code).toBe('empty');
    expect(validateStrKey(PUBLIC_KEY.toLowerCase()).error?.code).toBe('invalid_characters');
    expect(validateStrKey('=HYPERLINK("x")').error?.code).toBe('invalid_characters');
    expect(validateStrKey('Z' + PUBLIC_KEY.slice(1)).error?.code).toBe('unknown_prefix');
    expect(validateStrKey(PUBLIC_KEY.slice(0, -1)).error?.code).toBe('invalid_length');
    expect(validateStrKey(corrupt(PUBLIC_KEY)).error?.code).toBe('invalid_checksum');
  });

  it('keeps the prefix-implied type on an invalid value', () => {
    const result = validateStrKey(corrupt(CONTRACT));
    expect(result.valid).toBe(false);
    expect(result.keyType).toBe('contract');
  });

  it('never echoes a secret seed, valid or not', () => {
    for (const input of [SECRET, corrupt(SECRET), SECRET.toLowerCase()]) {
      const result = validateStrKey(input);
      expect(result.redacted).toBe(true);
      expect(result.input).not.toContain(SECRET.slice(1, -4));
      expect(result.input.toUpperCase()).not.toContain(SECRET.slice(1, -4));
    }
    const valid = validateStrKey(SECRET);
    expect(valid.valid).toBe(true);
    expect(valid.keyType).toBe('ed25519_secret_seed');
    expect(valid.input).toBe(maskSecretStrKey(SECRET));
  });

  it('redacts a seed pasted inside other text', () => {
    const result = validateStrKey(`key=${SECRET}`);
    expect(result.redacted).toBe(true);
    expect(result.input).not.toContain(SECRET);
  });
});

describe('validateStrKeyBatch', () => {
  it('validates rows independently and preserves request order', () => {
    const batch = validateStrKeyBatch([PUBLIC_KEY, 'nope', CONTRACT, '']);

    expect(batch.summary).toEqual({ total: 4, valid: 2, invalid: 2 });
    expect(batch.results.map((r) => r.index)).toEqual([0, 1, 2, 3]);
    expect(batch.results.map((r) => r.valid)).toEqual([true, false, true, false]);
  });
});

describe('strKeyBatchToCsv', () => {
  it('emits a BOM, the header, and one row per input', () => {
    const csv = strKeyBatchToCsv(validateStrKeyBatch([PUBLIC_KEY, corrupt(PUBLIC_KEY)]));
    expect(csv.startsWith('﻿')).toBe(true);

    const lines = csv.slice(1).trim().split('\n');
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe(STRKEY_CSV_HEADER.join(','));
    expect(lines[1]).toBe(`0,${PUBLIC_KEY},true,ed25519_public_key,,`);
    expect(lines[2]).toContain('invalid_checksum');
  });

  it('neutralizes spreadsheet formulas in echoed input', () => {
    const csv = strKeyBatchToCsv(validateStrKeyBatch(['=HYPERLINK("http://x")']));
    const row = csv.slice(1).trim().split('\n')[1];
    expect(row.startsWith(`0,"'=HYPERLINK(""http://x"")"`)).toBe(true);
  });

  it('writes the masked form of secret seeds', () => {
    const csv = strKeyBatchToCsv(validateStrKeyBatch([SECRET]));
    expect(csv).not.toContain(SECRET);
    expect(csv).toContain(maskSecretStrKey(SECRET));
  });
});
