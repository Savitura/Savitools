/**
 * One source of truth for the browser origins allowed to call the API
 * (Savitura/Savitools#255).
 *
 * `WEB_ORIGIN` accepts a comma-separated list, so a deployment can serve more
 * than one front-end (apex domain plus a preview/staging origin, for example)
 * without weakening the check. The HTTP CORS configuration in `main.ts`, the
 * Socket.IO CORS configuration and the gateway's own connection check all read
 * the allow-list through this module instead of each re-reading `process.env`.
 */

export const DEFAULT_WEB_ORIGIN = 'http://localhost:3000';

/** Splits `WEB_ORIGIN` into an allow-list, defaulting to localhost. */
export function parseWebOrigins(value: string | undefined | null): string[] {
  const origins = (value ?? '')
    .split(',')
    .map((origin) => origin.trim().replace(/\/+$/, ''))
    .filter((origin) => origin.length > 0);
  return origins.length > 0 ? origins : [DEFAULT_WEB_ORIGIN];
}

/**
 * True when a request origin may talk to the API. Requests without an `Origin`
 * header (curl, server-to-server calls, native clients) are not browsers
 * subject to CORS and are allowed through; browsers always send it.
 */
export function isAllowedWebOrigin(
  origin: string | undefined,
  allowedOrigins: readonly string[],
): boolean {
  if (!origin) {
    return true;
  }
  const normalized = origin.trim().replace(/\/+$/, '');
  return allowedOrigins.some(
    (allowed) => allowed.replace(/\/+$/, '') === normalized,
  );
}

/** The canonical origin used where exactly one is required (auth redirects). */
export function primaryWebOrigin(origins: readonly string[]): string {
  return origins[0] ?? DEFAULT_WEB_ORIGIN;
}
