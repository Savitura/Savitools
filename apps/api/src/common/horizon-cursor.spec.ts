import { exploreHorizon } from './horizon-cursor';

describe('exploreHorizon', () => {
  it('walks pages in order and forwards the cursor', async () => {
    const cursors: (string | null)[] = [];
    const result = await exploreHorizon(async (cursor) => {
      cursors.push(cursor);
      return cursor === null
        ? { records: ['a'], nextCursor: 'next' }
        : { records: ['b'], nextCursor: null };
    });
    expect(result).toEqual({ records: ['a', 'b'], pages: 2, nextCursor: null, truncated: false });
    expect(cursors).toEqual([null, 'next']);
  });

  it('stops at the page budget and reports a resumable cursor', async () => {
    const result = await exploreHorizon(async (cursor) => ({
      records: [cursor ?? 'first'],
      nextCursor: `${cursor ?? 'first'}-next`,
    }), { maxPages: 2 });
    expect(result.pages).toBe(2);
    expect(result.truncated).toBe(true);
    expect(result.nextCursor).toBe('first-next-next');
  });

  it('rejects a repeated cursor instead of looping forever', async () => {
    await expect(exploreHorizon(async () => ({ records: [], nextCursor: 'same' })))
      .rejects.toThrow('cursor repeated');
  });
});
