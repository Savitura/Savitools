import { act, renderHook } from '@testing-library/react';
import {
  addRecentItem,
  clearRecentItems,
  getRecentItems,
  RECENT_ITEMS_MAX_COUNT,
  RECENT_ITEMS_STORAGE_KEY,
  removeRecentItem,
  saveRecentItems,
  useRecentItems,
  type RecentItem,
} from '@/lib/recent-items';

function item(id: string, timestamp: number, href = `/tools/${id}`): RecentItem {
  return {
    id,
    category: 'general',
    title: `Item ${id}`,
    href,
    timestamp,
  };
}

describe('recent-items', () => {
  beforeEach(() => {
    window.localStorage.clear();
    jest.restoreAllMocks();
  });

  it('returns an empty list when the key is missing, corrupted, or not an array', () => {
    expect(getRecentItems()).toEqual([]);

    window.localStorage.setItem(RECENT_ITEMS_STORAGE_KEY, '{broken');
    expect(getRecentItems()).toEqual([]);

    window.localStorage.setItem(RECENT_ITEMS_STORAGE_KEY, JSON.stringify({ id: 'x' }));
    expect(getRecentItems()).toEqual([]);
  });

  it('recovers from corrupted JSON on the next write', () => {
    window.localStorage.setItem(RECENT_ITEMS_STORAGE_KEY, 'not json');

    const saved = addRecentItem({
      category: 'inspector',
      title: 'Transaction',
      href: '/inspector?hash=abc',
      timestamp: 100,
    });

    expect(saved.id).toMatch(/^inspector-/);
    expect(getRecentItems()).toEqual([saved]);
  });

  it('deduplicates by href and keeps the newest entry first', () => {
    const first = addRecentItem({
      id: 'same-id',
      category: 'general',
      title: 'Old',
      href: '/same',
      timestamp: 10,
    });
    const second = addRecentItem({
      id: 'different-id',
      category: 'general',
      title: 'New',
      href: '/same',
      timestamp: 20,
    });

    expect(getRecentItems()).toEqual([second]);
    expect(first.id).toBe('same-id');
  });

  it('bounds the stored list to the configured maximum', () => {
    const seeded = Array.from({ length: RECENT_ITEMS_MAX_COUNT + 2 }, (_, index) =>
      item(`item-${index}`, index + 1),
    );
    saveRecentItems(seeded);

    const newest = addRecentItem(item('newest', 1000));

    const stored = getRecentItems();
    expect(stored).toHaveLength(RECENT_ITEMS_MAX_COUNT);
    expect(stored[0]).toEqual(newest);
    expect(stored.map((entry) => entry.id)).not.toContain('item-9');
    expect(stored.map((entry) => entry.id)).not.toContain('item-10');
  });

  it('removes a single item and clears all items with update events', () => {
    const onUpdate = jest.fn();
    window.addEventListener('savitools-recent-update', onUpdate);

    saveRecentItems([item('a', 1), item('b', 2)]);
    expect(removeRecentItem('a').map((entry) => entry.id)).toEqual(['b']);

    clearRecentItems();
    expect(getRecentItems()).toEqual([]);
    expect(window.localStorage.getItem(RECENT_ITEMS_STORAGE_KEY)).toBeNull();
    expect(onUpdate).toHaveBeenCalledTimes(3);

    window.removeEventListener('savitools-recent-update', onUpdate);
  });

  it('does not throw when localStorage is unavailable', () => {
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('Storage blocked');
    });
    expect(getRecentItems()).toEqual([]);

    jest.restoreAllMocks();
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Storage blocked');
    });
    expect(() => saveRecentItems([item('a', 1)])).not.toThrow();

    jest.restoreAllMocks();
    jest.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('Storage blocked');
    });
    expect(() => clearRecentItems()).not.toThrow();
  });

  it('reflects storage events in the hook', () => {
    const { result } = renderHook(() => useRecentItems());

    expect(result.current.recents).toEqual([]);

    act(() => {
      result.current.addRecentItem(item('added', 1));
    });
    expect(result.current.recents).toHaveLength(1);

    act(() => {
      window.dispatchEvent(new StorageEvent('storage'));
    });
    expect(result.current.recents).toHaveLength(1);

    act(() => {
      result.current.clearRecentItems();
    });
    expect(result.current.recents).toEqual([]);
  });
});
