/**
 * Structured logging for tool execution failures.
 *
 * Scoped to SaviTools architecture across web tools and error boundaries.
 * Provides normalized error payloads, telemetry listener hooks, and
 * strict privacy and security redaction (Stellar secret seeds, JWTs,
 * Bearer tokens, sensitive context fields, and sanitized URLs).
 */

export const REDACTED = '[REDACTED]';

/** JWT token pattern: base64url header (eyJ) with three segments separated by dots. */
export const JWT_REGEX = /\beyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g;

/** Stellar secret seed pattern: S followed by 55 StrKey characters (56 characters total). */
export const SEED_REGEX = /\bS[A-Z2-7]{55}\b/g;

/** Bearer authorization token pattern. */
export const BEARER_PREFIX = 'Bearer ';

/** Known sensitive key patterns in context objects (case-insensitive substring match). */
export const SENSITIVE_KEY_PATTERNS = [
  /key/i,
  /jwt/i,
  /token/i,
  /secret/i,
  /signature/i,
  /signing_key/i,
  /private/i,
  /password/i,
  /authorization/i,
  /proxy-authorization/i,
  /credential/i,
  /cookie/i,
  /seed/i,
];

/** Bounded string length to prevent log injection or denial-of-service via huge payloads. */
const MAX_STRING_LENGTH = 2048;
const MAX_CONTEXT_DEPTH = 3;

/** Structured error details contained within the failure payload. */
export interface ToolExecutionErrorDetail {
  name: string;
  message: string;
  stack?: string;
  code?: string;
  statusCode?: number;
}

/** Standard structured payload emitted when a tool execution fails. */
export interface ToolExecutionFailureLog {
  level: 'error';
  event: 'tool_execution_failed';
  toolName: string;
  action?: string;
  error: ToolExecutionErrorDetail;
  componentStack?: string;
  context?: Record<string, unknown>;
  timestamp: string;
  environment: string;
  url?: string;
}

/** Input arguments accepted by `logToolExecutionFailure`. */
export interface LogToolExecutionFailureInput {
  toolName: string;
  action?: string;
  error: unknown;
  context?: Record<string, unknown>;
  componentStack?: string;
  url?: string;
}

export type ToolExecutionFailureListener = (log: ToolExecutionFailureLog) => void;

const listeners = new Set<ToolExecutionFailureListener>();

/**
 * Register a listener invoked whenever a tool execution failure is logged.
 * Useful for telemetry subscribers, test assertions, or analytics.
 * Returns an unregister function.
 */
export function addToolExecutionFailureListener(
  listener: ToolExecutionFailureListener,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Remove an existing listener.
 */
export function removeToolExecutionFailureListener(
  listener: ToolExecutionFailureListener,
): void {
  listeners.delete(listener);
}

/**
 * Clear all registered listeners (primarily for test isolation).
 */
export function clearToolExecutionFailureListeners(): void {
  listeners.clear();
}

/**
 * Redacts secrets, seeds, and tokens from a string.
 */
export function redactString(value: string): string {
  if (!value) return value;
  let out = value;
  if (out.includes('.')) {
    out = out.replace(JWT_REGEX, REDACTED);
  }
  out = out.replace(SEED_REGEX, REDACTED);
  out = out.replace(
    new RegExp(`^${BEARER_PREFIX}[A-Za-z0-9_.-]+`, 'gi'),
    `${BEARER_PREFIX}${REDACTED}`,
  );
  return out;
}

/**
 * Checks whether a context key name contains sensitive terminology.
 */
export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key));
}

/**
 * Truncates strings exceeding maximum allowable length.
 */
function truncateString(str: string, maxLength = MAX_STRING_LENGTH): string {
  if (str.length <= maxLength) return str;
  return `${str.slice(0, maxLength)}… [truncated]`;
}

/**
 * Strips control characters (e.g. carriage returns, newlines) to prevent log injection.
 */
function sanitizeIdentifier(id: string): string {
  return id.replace(/[\r\n\t]/g, '').trim().slice(0, 128);
}

/**
 * Deep redaction and size-bounding for context values.
 */
export function redactValue(
  value: unknown,
  keyHint?: string,
  depth = 0,
  seen = new WeakSet<object>(),
): unknown {
  if (keyHint && isSensitiveKey(keyHint)) {
    return REDACTED;
  }
  if (value === null || value === undefined) {
    return value;
  }
  if (typeof value === 'string') {
    return truncateString(redactString(value));
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'bigint') {
    return value.toString();
  }
  if (typeof value === 'symbol' || typeof value === 'function') {
    return String(value);
  }

  if (depth >= MAX_CONTEXT_DEPTH) {
    return '[MaxDepthExceeded]';
  }

  if (typeof value === 'object') {
    if (seen.has(value as object)) {
      return '[Circular]';
    }
    seen.add(value as object);

    if (Array.isArray(value)) {
      return value
        .slice(0, 50)
        .map((item) => redactValue(item, keyHint, depth + 1, seen));
    }

    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = redactValue(v, k, depth + 1, seen);
    }
    return out;
  }

  return String(value);
}

/**
 * Strips credentials and query string parameters from URLs for log privacy.
 */
export function sanitizeUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl, 'http://localhost');
    return `${parsed.pathname}`;
  } catch {
    return rawUrl.replace(/\/\/[^/@]+@/, '//').replace(/[?#].*$/, '').trim();
  }
}

/**
 * Retrieves the current sanitized path from window.location if available.
 */
function resolveCurrentUrl(): string | undefined {
  if (typeof window !== 'undefined' && window.location) {
    return sanitizeUrl(window.location.pathname || '/');
  }
  return undefined;
}

/**
 * Extracts structured error information from unknown caught exceptions.
 */
function extractErrorDetail(error: unknown): ToolExecutionErrorDetail {
  if (error instanceof Error) {
    const errorRecord = error as unknown as Record<string, unknown>;
    const code =
      typeof errorRecord.code === 'string'
        ? errorRecord.code
        : typeof errorRecord.status === 'string'
          ? errorRecord.status
          : undefined;

    const statusCode =
      typeof errorRecord.statusCode === 'number'
        ? errorRecord.statusCode
        : typeof errorRecord.status === 'number'
          ? errorRecord.status
          : undefined;

    return {
      name: error.name || 'Error',
      message: redactString(truncateString(error.message || 'Unknown error')),
      ...(error.stack ? { stack: redactString(truncateString(error.stack, 4096)) } : {}),
      ...(code ? { code } : {}),
      ...(statusCode !== undefined ? { statusCode } : {}),
    };
  }

  if (typeof error === 'string') {
    return {
      name: 'Error',
      message: redactString(truncateString(error)),
    };
  }

  if (error && typeof error === 'object') {
    const record = error as Record<string, unknown>;
    const message = typeof record.message === 'string' ? record.message : JSON.stringify(record);
    const code = typeof record.code === 'string' ? record.code : undefined;
    return {
      name: typeof record.name === 'string' ? record.name : 'UnknownError',
      message: redactString(truncateString(message)),
      ...(code ? { code } : {}),
    };
  }

  return {
    name: 'UnknownError',
    message: String(error ?? 'An unexpected tool execution error occurred'),
  };
}

/**
 * Core structured logging function for tool execution failures.
 *
 * Produces a standardized JSON-compatible log entry, strips sensitive data,
 * emits to any registered telemetry listeners, and prints structured JSON to
 * `console.error`.
 */
export function logToolExecutionFailure(
  input: LogToolExecutionFailureInput,
): ToolExecutionFailureLog {
  const toolName = sanitizeIdentifier(input.toolName || 'UnknownTool');
  const action = input.action ? sanitizeIdentifier(input.action) : undefined;
  const errorDetail = extractErrorDetail(input.error);
  const context = input.context
    ? (redactValue(input.context) as Record<string, unknown>)
    : undefined;
  const componentStack = input.componentStack
    ? redactString(truncateString(input.componentStack, 4096))
    : undefined;
  const url = input.url ? sanitizeUrl(input.url) : resolveCurrentUrl();

  const payload: ToolExecutionFailureLog = {
    level: 'error',
    event: 'tool_execution_failed',
    toolName,
    ...(action ? { action } : {}),
    error: errorDetail,
    ...(componentStack ? { componentStack } : {}),
    ...(context && Object.keys(context).length > 0 ? { context } : {}),
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV ?? 'development',
    ...(url ? { url } : {}),
  };

  // Notify registered listeners
  for (const listener of listeners) {
    try {
      listener(payload);
    } catch {
      // Listener errors must not crash execution
    }
  }

  // Output structured log to console.error
  console.error(`[ToolExecutionError:${toolName}]`, JSON.stringify(payload));

  return payload;
}

/**
 * Executes an asynchronous or synchronous tool action with automated structured failure logging.
 */
export async function executeToolAction<T>(
  toolName: string,
  action: string,
  fn: () => Promise<T> | T,
  context?: Record<string, unknown>,
): Promise<T> {
  try {
    return await fn();
  } catch (error: unknown) {
    logToolExecutionFailure({
      toolName,
      action,
      error,
      context,
    });
    throw error;
  }
}
