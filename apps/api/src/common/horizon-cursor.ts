import { redactString } from './redaction';

const MAX_DIAGNOSTIC_ENDPOINT_LENGTH = 200;
const MAX_DIAGNOSTIC_CURSOR_LENGTH = 128;
const CONTROL_CHARS_REGEX = /[\u0000-\u001f\u007f]+/g;
const HTTP_METHOD_PREFIX_REGEX = /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+(.+)$/i;
const URL_SCHEME_REGEX = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//;

/** A small, transport-agnostic representation of a Horizon page. */
export interface HorizonPage<T> {
  records: T[];
  nextCursor: string | null;
  /** Optional Horizon endpoint URL or path that served this page, used for loop diagnostics. */
  endpoint?: string;
}

export interface CursorExplorerOptions {
  limit?: number;
  maxPages?: number;
  /** Optional Horizon endpoint URL or path being paginated, included in loop diagnostics. */
  endpoint?: string;
  /** Optional starting cursor when resuming pagination; seeded into loop detection. */
  initialCursor?: string | null;
}

/** Sanitized context attached when Horizon repeats a pagination cursor. */
export interface HorizonCursorLoopDiagnostics {
  /** Redacted Horizon endpoint (`origin + pathname` or query-stripped path), or `null` when omitted. */
  endpoint: string | null;
  /** 1-based page number on which the repeated cursor was returned. */
  page: number;
  /** Effective per-page record limit requested. */
  limit: number;
  /** Sanitized cursor sent for the failing page request (`null` on an uncursed initial request). */
  requestCursor: string | null;
  /** Sanitized `nextCursor` value that repeated an earlier cursor. */
  repeatedCursor: string;
  /** Number of unique cursors observed before the loop was detected. */
  seenCursorCount: number;
}

function boundLength(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength)}…` : value;
}

function stripControlChars(value: string): string {
  return value.replace(CONTROL_CHARS_REGEX, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Normalize an endpoint identifier for logs and error diagnostics without
 * leaking query parameters, URL fragments, userinfo credentials, secret seeds,
 * or control characters.
 */
export function sanitizeHorizonEndpoint(endpoint?: string | null): string | null {
  if (typeof endpoint !== 'string') {
    return null;
  }

  const cleaned = stripControlChars(endpoint);
  if (!cleaned) {
    return null;
  }

  const methodMatch = HTTP_METHOD_PREFIX_REGEX.exec(cleaned);
  const methodPrefix = methodMatch ? `${methodMatch[1].toUpperCase()} ` : '';
  const target = methodMatch ? methodMatch[2].trim() : cleaned;

  let normalizedTarget: string;
  if (URL_SCHEME_REGEX.test(target)) {
    try {
      const parsed = new URL(target);
      normalizedTarget = `${parsed.origin}${redactString(parsed.pathname)}`;
    } catch {
      const stripped = target.replace(/\/\/[^/@]+@/, '//').replace(/[?#].*$/, '');
      const slashIndex = stripped.indexOf('/', stripped.indexOf('://') + 3);
      normalizedTarget =
        slashIndex === -1
          ? stripped
          : `${stripped.slice(0, slashIndex)}${redactString(stripped.slice(slashIndex))}`;
    }
  } else {
    normalizedTarget = redactString(target.replace(/[?#].*$/, '').trim());
  }

  if (!normalizedTarget) {
    return null;
  }

  return boundLength(`${methodPrefix}${normalizedTarget}`, MAX_DIAGNOSTIC_ENDPOINT_LENGTH);
}

function sanitizeDiagnosticCursor(cursor: string): string {
  const cleaned = stripControlChars(cursor);
  return boundLength(redactString(cleaned), MAX_DIAGNOSTIC_CURSOR_LENGTH);
}

/**
 * Raised when a Horizon endpoint returns a `nextCursor` that has already been
 * visited in the current pagination walk.
 */
export class HorizonCursorLoopError extends Error {
  readonly code = 'HORIZON_CURSOR_LOOP' as const;
  readonly diagnostics: Readonly<HorizonCursorLoopDiagnostics>;

  constructor(diagnostics: HorizonCursorLoopDiagnostics) {
    const endpointClause = diagnostics.endpoint ? ` on ${diagnostics.endpoint}` : '';
    super(
      `Horizon pagination cursor repeated${endpointClause} (page ${diagnostics.page}, cursor=${diagnostics.repeatedCursor})`,
    );
    this.name = HorizonCursorLoopError.name;
    this.diagnostics = Object.freeze({ ...diagnostics });
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Consume a Horizon-style cursor stream without following untrusted links.
 * The caller owns URL construction, so pagination remains tenant/network
 * scoped and cannot be redirected to an arbitrary host by `_links.next`.
 */
export async function exploreHorizon<T>(
  fetchPage: (cursor: string | null, limit: number) => Promise<HorizonPage<T>>,
  options: CursorExplorerOptions = {},
): Promise<{ records: T[]; pages: number; nextCursor: string | null; truncated: boolean }> {
  const limit = Math.min(Math.max(options.limit ?? 100, 1), 200);
  const maxPages = Math.min(Math.max(options.maxPages ?? 50, 1), 1000);
  const records: T[] = [];
  const seen = new Set<string>();
  let cursor: string | null = options.initialCursor ?? null;
  if (cursor) {
    seen.add(cursor);
  }
  let pages = 0;

  while (pages < maxPages) {
    const requestCursor = cursor;
    const page = await fetchPage(requestCursor, limit);
    pages += 1;
    records.push(...page.records);
    if (!page.nextCursor) return { records, pages, nextCursor: null, truncated: false };
    if (seen.has(page.nextCursor)) {
      const endpoint =
        sanitizeHorizonEndpoint(page.endpoint) ?? sanitizeHorizonEndpoint(options.endpoint);
      throw new HorizonCursorLoopError({
        endpoint,
        page: pages,
        limit,
        requestCursor: requestCursor === null ? null : sanitizeDiagnosticCursor(requestCursor),
        repeatedCursor: sanitizeDiagnosticCursor(page.nextCursor),
        seenCursorCount: seen.size,
      });
    }
    seen.add(page.nextCursor);
    cursor = page.nextCursor;
  }

  return { records, pages, nextCursor: cursor, truncated: true };
}
