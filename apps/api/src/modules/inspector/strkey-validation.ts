import { StrKey } from '@stellar/stellar-sdk';
import { CSV_BOM, neutralizeCsvFormula, toCsv } from '../../common/csv';
import { redactString } from '../../common/redaction';

/**
 * Offline, batch StrKey validation for the inspector (Savitura/Savitools#500).
 *
 * Every row is validated independently: one bad value never fails the batch.
 * Checksum verification is delegated to `StrKey` from `@stellar/stellar-sdk`;
 * the prefix/alphabet/length checks before it only exist to give each failure
 * a precise, machine-readable reason.
 */

/** Upper bound on values per request; keeps one call well inside the body limit. */
export const MAX_STRKEY_BATCH_SIZE = 500;

/** Longest StrKey is a signed payload (P…), 165 characters. */
export const MAX_STRKEY_INPUT_LENGTH = 256;

export type StrKeyKind =
  | 'ed25519_public_key'
  | 'ed25519_secret_seed'
  | 'muxed_account'
  | 'pre_auth_tx'
  | 'sha256_hash'
  | 'signed_payload'
  | 'contract';

export type StrKeyErrorCode =
  'empty' | 'unknown_prefix' | 'invalid_characters' | 'invalid_length' | 'invalid_checksum';

interface StrKeyKindSpec {
  kind: StrKeyKind;
  /** Exact encoded length, or `null` when the length is variable (signed payload). */
  length: number | null;
  isValid: (value: string) => boolean;
}

/** The SDK has no `isValid*` for T/X keys; a successful decode is the equivalent check. */
function decodes(decode: (value: string) => unknown, value: string): boolean {
  try {
    decode(value);
    return true;
  } catch {
    return false;
  }
}

const KIND_BY_PREFIX: Record<string, StrKeyKindSpec> = {
  G: {
    kind: 'ed25519_public_key',
    length: 56,
    isValid: (value) => StrKey.isValidEd25519PublicKey(value),
  },
  S: {
    kind: 'ed25519_secret_seed',
    length: 56,
    isValid: (value) => StrKey.isValidEd25519SecretSeed(value),
  },
  M: {
    kind: 'muxed_account',
    length: 69,
    isValid: (value) => StrKey.isValidMed25519PublicKey(value),
  },
  T: {
    kind: 'pre_auth_tx',
    length: 56,
    isValid: (value) => decodes((v) => StrKey.decodePreAuthTx(v), value),
  },
  X: {
    kind: 'sha256_hash',
    length: 56,
    isValid: (value) => decodes((v) => StrKey.decodeSha256Hash(v), value),
  },
  P: {
    kind: 'signed_payload',
    length: null,
    isValid: (value) => StrKey.isValidSignedPayload(value),
  },
  C: {
    kind: 'contract',
    length: 56,
    isValid: (value) => StrKey.isValidContract(value),
  },
};

const BASE32_PATTERN = /^[A-Z2-7]+$/;

export interface StrKeyValidationError {
  code: StrKeyErrorCode;
  message: string;
}

export interface StrKeyValidationResult {
  /** Zero-based position of the value in the request. */
  index: number;
  /**
   * The trimmed value as supplied, except secret-seed-shaped values (`S…`),
   * which are masked so the response and the CSV never carry signing material.
   */
  input: string;
  /** True when `input` was masked. */
  redacted: boolean;
  valid: boolean;
  /** The type implied by the prefix, or `null` when the prefix is unknown. */
  keyType: StrKeyKind | null;
  error: StrKeyValidationError | null;
}

export interface StrKeyBatchSummary {
  total: number;
  valid: number;
  invalid: number;
}

export interface StrKeyBatchValidation {
  summary: StrKeyBatchSummary;
  results: StrKeyValidationResult[];
}

/** Keep the prefix and the last four characters, mirroring the web StrKey lab. */
export function maskSecretStrKey(value: string): string {
  if (value.length <= 5) return '*'.repeat(value.length);
  return `${value[0]}${'*'.repeat(value.length - 5)}${value.slice(-4)}`;
}

function failure(code: StrKeyErrorCode, message: string): StrKeyValidationError {
  return { code, message };
}

export function validateStrKey(raw: string, index = 0): StrKeyValidationResult {
  const value = raw.trim();
  const spec = value ? KIND_BY_PREFIX[value[0]] : undefined;
  // Mask anything seed-shaped, including lower-cased or malformed seeds, and
  // fall back to the shared redactor for seeds or JWTs pasted inside other text.
  const display = /^s/i.test(value) ? maskSecretStrKey(value) : redactString(value);
  const row = {
    index,
    input: display,
    redacted: display !== value,
    keyType: spec?.kind ?? null,
  };

  let error: StrKeyValidationError | null = null;
  if (!value) {
    error = failure('empty', 'Value is empty');
  } else if (!BASE32_PATTERN.test(value)) {
    error = failure(
      'invalid_characters',
      'StrKeys use only upper-case A-Z and digits 2-7 (base32)',
    );
  } else if (!spec) {
    error = failure('unknown_prefix', `Unknown StrKey prefix "${value[0]}"`);
  } else if (spec.length !== null && value.length !== spec.length) {
    error = failure(
      'invalid_length',
      `Expected ${spec.length} characters for ${spec.kind}, got ${value.length}`,
    );
  } else if (!spec.isValid(value)) {
    error = failure(
      'invalid_checksum',
      spec.length === null
        ? 'Checksum, length, or payload encoding is invalid'
        : 'Checksum or encoding is invalid',
    );
  }

  return { ...row, valid: error === null, error };
}

export function validateStrKeyBatch(inputs: string[]): StrKeyBatchValidation {
  const results = inputs.map((input, index) => validateStrKey(input, index));
  const valid = results.filter((result) => result.valid).length;
  return {
    summary: { total: results.length, valid, invalid: results.length - valid },
    results,
  };
}

export const STRKEY_CSV_HEADER = [
  'index',
  'input',
  'valid',
  'key_type',
  'error_code',
  'error_message',
];

/** One row per value, in request order, with a UTF-8 BOM for Excel. */
export function strKeyBatchToCsv(batch: StrKeyBatchValidation): string {
  const rows: unknown[][] = batch.results.map((result) => [
    result.index,
    neutralizeCsvFormula(result.input),
    result.valid,
    result.keyType ?? '',
    result.error?.code ?? '',
    result.error?.message ?? '',
  ]);
  return CSV_BOM + toCsv([STRKEY_CSV_HEADER, ...rows]);
}
