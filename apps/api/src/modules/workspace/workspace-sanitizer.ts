/**
 * Secret key prefixes and patterns for Stellar and generic credentials.
 */
const STELLAR_SECRET_KEY_REGEX = /^S[A-Z2-7]{55}$/;
const SENSITIVE_KEY_SUBSTRINGS = [
  'secret',
  'private',
  'seed',
  'signature',
  'signedtransaction',
  'signedxdr',
  'signingkey',
];

/**
 * Sanitizes workspace state before sharing or exporting to ensure no secrets,
 * private seeds, or signed transaction payloads leak.
 */
export function sanitizeWorkspaceData(data: Record<string, unknown>): {
  sanitized: Record<string, unknown>;
  redactedCount: number;
} {
  let redactedCount = 0;

  function isSensitiveKey(key: string): boolean {
    const lower = key.toLowerCase();
    return SENSITIVE_KEY_SUBSTRINGS.some((sub) => lower.includes(sub));
  }

  function deepClean(val: unknown, keyName?: string): unknown {
    if (val === null || val === undefined) {
      return val;
    }

    if (keyName && isSensitiveKey(keyName)) {
      redactedCount++;
      return undefined;
    }

    if (typeof val === 'string') {
      const trimmed = val.trim();
      if (STELLAR_SECRET_KEY_REGEX.test(trimmed)) {
        redactedCount++;
        return undefined;
      }
      return val;
    }

    if (Array.isArray(val)) {
      return val.map((item) => deepClean(item)).filter((item) => item !== undefined);
    }

    if (typeof val === 'object') {
      const cleanedObj: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
        if (isSensitiveKey(k)) {
          redactedCount++;
          continue;
        }
        if (typeof v === 'string' && STELLAR_SECRET_KEY_REGEX.test(v.trim())) {
          redactedCount++;
          continue;
        }
        const cleanedValue = deepClean(v, k);
        if (cleanedValue !== undefined) {
          cleanedObj[k] = cleanedValue;
        }
      }
      return cleanedObj;
    }

    return val;
  }

  const sanitized = deepClean(data) as Record<string, unknown>;
  return { sanitized, redactedCount };
}
