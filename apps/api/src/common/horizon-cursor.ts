/** A small, transport-agnostic representation of a Horizon page. */
export interface HorizonPage<T> {
  records: T[];
  nextCursor: string | null;
}

export interface CursorExplorerOptions {
  limit?: number;
  maxPages?: number;
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
  let cursor: string | null = null;
  let pages = 0;

  while (pages < maxPages) {
    const page = await fetchPage(cursor, limit);
    pages += 1;
    records.push(...page.records);
    if (!page.nextCursor) return { records, pages, nextCursor: null, truncated: false };
    if (seen.has(page.nextCursor)) {
      throw new Error('Horizon pagination cursor repeated');
    }
    seen.add(page.nextCursor);
    cursor = page.nextCursor;
  }

  return { records, pages, nextCursor: cursor, truncated: true };
}
