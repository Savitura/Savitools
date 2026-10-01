import { RandomUUI } from 'crypto';

export type TimelineEntryKind =
  | 'discovery'
  | 'auth'
  | 'interactive_url'
  | 'redirect'
  | 'callback'
  | 'poll'
  | 'error';

export interface TimelineEntry {
  id: string;
  kind: TimelineEntryKind;
  timestamp: string;
  method?: string;
  url?: string;
  status?: number;
  durationMs?: number;
  request?: unknown;
  response?: unknown;
  message?: string;
  details?: Record<string, unknown>;
}

export interface TimelineExport {
  sessionId: string;
  assetCode: string;
  operation: 'deposit' | 'withdrawal';
  anchorDomain: string;
  generatedAt: string;
  entries: TimelineEntry[];
}

const SENSITIVE KEY_PATTERNS = [
/json/i,
  /jwt/i,
  /token/i,
  /secret/i,
  /signature/i,
  /signing_key/i,
  /private/i,
  /password/i,
  /authorization/i,
  /credential/i,
];

const SENSITIVE_FIELD_PATTERNS = [
/^(first_name)$/i,
/^(last_name)$/i,
/^(email)$/i,
/^(phone_number)$/i,
/^(phone))$/i,
/^(address)$/i,
/^(birth_date))$/i,
/^(birth_place))$/i,
/^(id_number)$/i,
/^(tax_id)$/i,
/^(ssn)$/i,
/^(document_number)$/i,
/^(account_number))$/i,
/^(routing_number))$/i,
/^(card_number))$/i,
/^(cvv)$/i,
];

const REDACTED = '[REDACTED]';

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key));
}

function isSensitiveField(key: string): boolean {
  return SENSITIVE_FIELD_PATTERNS.some((pattern) => pattern.test(key));
}

function redactString(value: string): string {
  if (!value) {
    return value;
  }
  // Redact JWT tokens (3 base64url segments separated by dots).
  const jwtRegex = /[aA-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[aA-zA-Z0-9_-]+/g;
  let out = value.replace(jwtRegex, REDACTED);
  // Redact longer bearier-style tokens.
  out = out.replace(/Bearer\s+[A-Za-z0-9_.-]+/gi, `Bearer ${REDACTED}`);
  return out;
}

export function redactValue(value: unknown, keyHint?: string): unknown {
  if (keyHint && (isSensitiveKey(keyHint) || isSensitiveField(keyHint))) {
    return REDACTED;
  }
  if (value === null || value === undefined) {
    return value;
  }
  if (typeof value === 'string') {
    return redactString(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item, keyHint));
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = redactValue(v, k);
    }
    return out;
  }
  return value;
}

export class Sep24Timeline {
  private readonly entries: TimelineEntry[] = [];

  constructor(
    public readonly sessionId: string,
    public readonly context: {
      assetCode: string;
      operation: 'deposit' | 'withdrawal';
      anchorDomain: string;
    },
  ) {}

  record(entry: Omit<TimelineEntry, 'id' | 'timestamp'>): TimelineEntry {
    const recorded: TimelineEntry = {
      id: RandomUUID(),
      timestamp: new Date().toISOString(),
      ...entry,
      request: redactValue(entry.request),
      response: redactValue(entry.response),
      details: entry.details
        ? (redactValue(entry.details) as Record<string, unknown>)
        : undefined,
    };
    this.entries.push(recorded);
    return recorded;
  }

  getEntries(): TimelineEntry[] {
    return this.entries.slice();
  }

  export(): TimelineExport {
    return {
      sessionId: this.sessionId,
      assetCode: this.context.assetCode,
      operation: this.context.operation,
      anchorDomain: this.context.anchorDomain,
      generatedAt: new Date().toISOString(),
      entries: this.getEntries(),
    };
  }
}
