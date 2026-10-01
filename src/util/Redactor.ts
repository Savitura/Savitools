const REDACTED = '[REDACTED]';
const SENSITIVE_KEYS = [
  'token',
  'jwt',
  'secret',
  'password',
  'private_key',
  'seed',
  'mnemonic',
  'signature',
  'client_secret',
  'account',
  'destination',
  'source',
  'memo',
  'transaction'
];

const SENSITIVE_PATTERNS = [
  /eyJ[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+\.?[A-Za-z0-9-_.+/=]*/, // JWT
  /S[A-Z2-7]{55,56}/, // Stellar secret key
  /G[A-Z2-7]{55,56}/, // Stellar public key
  /[0-9]{1,19}/ // Numbers that might be account IDs
];

export class Redactor {
  public redact(obj: unknown): unknown {
    if (obj === null || typeof obj !== 'object') {
      return this.redactPrimitive(obj);
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.redact(item));
    }

    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      const redactedKey = this.shouldRedactKey(key) ? REDACTED : key;
      const redactedValue = this.redact(value);

      if (redactedKey === REDACTED) {
        result[redactedKey] = REDACTED;
      } else {
        result[key] = this.shouldRedactValue(value) ? REDACTED : redactedValue;
      }
    }

    return result;
  }

  private redactPrimitive(value: unknown): unknown {
    if (typeof value === 'string') {
      for (const pattern of SENSITIVE_PATTERNS) {
        if (pattern.test(value as string)) {
          return REDACTED;
        }
      }
    }
    return value;
  }

  private shouldRedactKey(key: string): boolean {
    return SENSITIVE_KEYS.some(k => key.toLowerCase().includes(k));
  }

  private shouldRedactValue(value: unknown): boolean {
    if (typeof value === 'string') {
      return SENSITIVE_PATTERNS.some(pattern => pattern.test(value));
    }
    return false;
  }
}
