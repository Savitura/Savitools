import * as StellarSdk from '@stellar/stellar-sdk';

/**
 * Stellar secret seed: S followed by 55 base32 characters.
 */
export const STELLAR_SECRET_SEED_REGEX = /^S[A-Z2-7]{55}$/;
export const STELLAR_SECRET_SEED_ANYWHERE_REGEX = /S[A-Z2-7]{55}/g;

/**
 * Bearer token / JWT regexes for sensitive auth material.
 */
export const JWT_REGEX = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
export const BEARER_REGEX = /^Bearer\s+[A-Za-z0-9_.-]+/i;

/**
 * Substrings indicating sensitive keys (credentials, secrets, private keys).
 */
export const SENSITIVE_KEY_SUBSTRINGS = [
  'secret',
  'private',
  'seed',
  'password',
  'token',
  'jwt',
  'authorization',
  'credential',
  'cookie',
  'apikey',
  'api_key',
  'signingkey',
  'signing_key',
  'privatekey',
  'private_key',
  'secretkey',
  'secret_key',
];

/**
 * Substrings indicating signature / signed transaction payload keys.
 */
export const SIGNATURE_KEY_SUBSTRINGS = [
  'signedtransaction',
  'signed_transaction',
  'signedxdr',
  'signed_xdr',
  'signedenvelope',
  'signed_envelope',
  'signatures',
  'signature',
];

/**
 * Check if a key name matches any known sensitive credential pattern.
 */
export function isSensitiveKey(key: string): boolean {
  const lower = key.toLowerCase();
  return SENSITIVE_KEY_SUBSTRINGS.some((sub) => lower.includes(sub));
}

/**
 * Check if a key name matches any signature or signed transaction payload pattern.
 * Explicitly ignores 'unsigned' occurrences so unsigned transactions/XDRs are preserved.
 */
export function isSignatureKey(key: string): boolean {
  const lower = key.toLowerCase();
  if (lower.includes('unsigned')) {
    return false;
  }
  return SIGNATURE_KEY_SUBSTRINGS.some((sub) => lower.includes(sub));
}

/**
 * Check if a string is a base64-encoded Stellar transaction envelope with 1+ signatures.
 */
export function isSignedTransactionEnvelope(value: string): boolean {
  if (typeof value !== 'string' || value.length < 20) {
    return false;
  }
  try {
    const envelope = StellarSdk.xdr.TransactionEnvelope.fromXDR(value, 'base64');
    const typeName = envelope.switch().name;
    let signatures: StellarSdk.xdr.DecoratedSignature[] = [];
    if (typeName === 'envelopeTypeTxV0') {
      signatures = envelope.v0().signatures();
    } else if (typeName === 'envelopeTypeTx') {
      signatures = envelope.v1().signatures();
    } else if (typeName === 'envelopeTypeTxFeeBump') {
      signatures = envelope.feeBump().signatures();
    }
    return Array.isArray(signatures) && signatures.length > 0;
  } catch {
    return false;
  }
}

/**
 * Check if a string is a secret (Stellar secret seed, JWT, Bearer token).
 */
export function isSecretString(value: string): boolean {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (STELLAR_SECRET_SEED_REGEX.test(trimmed)) return true;
  if (JWT_REGEX.test(trimmed)) return true;
  if (BEARER_REGEX.test(trimmed)) return true;
  return false;
}

export interface SanitizeWorkspaceResult {
  sanitized: Record<string, unknown>;
  redactedCount: number;
}

/**
 * Recursively sanitizes workspace state prior to export or sharing.
 * Strips secret seeds, private keys, bearer/JWT tokens, signed transactions, and signatures.
 */
export function sanitizeWorkspaceData(data: Record<string, unknown>): SanitizeWorkspaceResult {
  let redactedCount = 0;

  function deepClean(val: unknown, keyName?: string): unknown {
    if (val === null || val === undefined) {
      return val;
    }

    // Key-level filtering: sensitive credential keys or signature keys
    if (keyName && (isSensitiveKey(keyName) || isSignatureKey(keyName))) {
      redactedCount++;
      return undefined;
    }

    // String-level filtering: secret seed, JWT, bearer token, signed transaction XDR
    if (typeof val === 'string') {
      if (isSecretString(val) || isSignedTransactionEnvelope(val)) {
        redactedCount++;
        return undefined;
      }
      // If a secret seed is embedded inside a string (e.g. memo or text), redact it
      if (/S[A-Z2-7]{55}/.test(val)) {
        redactedCount++;
        return val.replace(/S[A-Z2-7]{55}/g, '[REDACTED]');
      }
      return val;
    }

    if (Array.isArray(val)) {
      return val
        .map((item) => deepClean(item))
        .filter((item) => {
          if (item === undefined) return false;
          // Filter out objects in arrays that became empty solely due to stripping sensitive keys
          if (
            typeof item === 'object' &&
            item !== null &&
            !Array.isArray(item) &&
            Object.keys(item).length === 0
          ) {
            return false;
          }
          return true;
        });
    }

    if (typeof val === 'object') {
      const cleaned: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
        if (isSensitiveKey(k) || isSignatureKey(k)) {
          redactedCount++;
          continue;
        }
        const cleanedValue = deepClean(v, k);
        if (cleanedValue !== undefined) {
          cleaned[k] = cleanedValue;
        }
      }
      return cleaned;
    }

    return val;
  }

  const sanitized = (deepClean(data) as Record<string, unknown>) || {};
  return { sanitized, redactedCount };
}
