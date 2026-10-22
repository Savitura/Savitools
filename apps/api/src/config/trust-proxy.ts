/**
 * Parse TRUST_PROXY for Fastify's `trustProxy` option
 * (Savitura/Savitools#419).
 *
 * Accepted forms:
 * - unset / empty / "false" → false (socket address only; safest default)
 * - "true" → true (trust all hops)
 * - a positive integer → hop count (e.g. "1" behind a single reverse proxy)
 * - a single IP or CIDR → trust that address
 * - comma-separated IPs/CIDRs → trust that list
 */
export function parseTrustProxy(
  value: string | undefined,
): boolean | number | string | string[] {
  if (value === undefined) {
    return false;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0 || /^false$/i.test(trimmed)) {
    return false;
  }
  if (/^true$/i.test(trimmed)) {
    return true;
  }
  // Pure integers (including 1) are hop counts — the usual form behind one proxy.
  if (/^\d+$/.test(trimmed)) {
    return Number(trimmed);
  }

  if (trimmed.includes(',')) {
    const entries = trimmed
      .split(',')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
    return entries.length === 1 ? entries[0] : entries;
  }

  return trimmed;
}
