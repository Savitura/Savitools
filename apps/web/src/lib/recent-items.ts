'use client';

import { useCallback, useEffect, useState } from 'react';
import { BROWSER_STORAGE_KEYS, safeGetItem, safeRemoveItem, safeSetItem } from './browser-storage';

export const RECENT_ITEMS_STORAGE_KEY = BROWSER_STORAGE_KEYS.RECENT_ITEMS;
export const RECENT_ITEMS_MAX_COUNT = 10;

export type RecentCategory =
  | 'inspector'
  | 'composer'
  | 'monitor'
  | 'sandbox'
  | 'webhooks'
  | 'simulator'
  | 'contracts'
  | 'general';

export interface RecentItem {
  id: string;
  category: RecentCategory;
  title: string;
  subtitle?: string;
  href: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export function getRecentItems(): RecentItem[] {
  const parsed = safeGetItem<unknown>(RECENT_ITEMS_STORAGE_KEY, []);
  return Array.isArray(parsed) ? (parsed as RecentItem[]) : [];
}

export function saveRecentItems(items: RecentItem[]): void {
  const result = safeSetItem(RECENT_ITEMS_STORAGE_KEY, items);
  if (result.success && typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('savitools-recent-update'));
  }
}

let itemCounter = 0;

export function addRecentItem(
  item: Omit<RecentItem, 'id' | 'timestamp'> & { id?: string; timestamp?: number },
): RecentItem {
  const current = getRecentItems();
  const id = item.id || `${item.category}-${item.href}-${Date.now()}-${++itemCounter}`;
  const now = item.timestamp || Date.now();

  // Deduplicate by id or matching href
  const filtered = current.filter((r) => r.id !== id && r.href !== item.href);

  const newItem: RecentItem = {
    ...item,
    id,
    timestamp: now,
  };

  const updated = [newItem, ...filtered].slice(0, RECENT_ITEMS_MAX_COUNT);
  saveRecentItems(updated);
  return newItem;
}

export function removeRecentItem(id: string): RecentItem[] {
  const current = getRecentItems();
  const updated = current.filter((r) => r.id !== id);
  saveRecentItems(updated);
  return updated;
}

export function clearRecentItems(): void {
  const result = safeRemoveItem(RECENT_ITEMS_STORAGE_KEY);
  if (result.success && typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('savitools-recent-update'));
  }
}

export function useRecentItems() {
  const [recents, setRecents] = useState<RecentItem[]>([]);

  useEffect(() => {
    setRecents(getRecentItems());

    const handleUpdate = () => {
      setRecents(getRecentItems());
    };

    window.addEventListener('savitools-recent-update', handleUpdate);
    window.addEventListener('storage', handleUpdate);

    return () => {
      window.removeEventListener('savitools-recent-update', handleUpdate);
      window.removeEventListener('storage', handleUpdate);
    };
  }, []);

  const add = useCallback((item: Parameters<typeof addRecentItem>[0]) => {
    return addRecentItem(item);
  }, []);

  const remove = useCallback((id: string) => {
    return removeRecentItem(id);
  }, []);

  const clear = useCallback(() => {
    clearRecentItems();
  }, []);

  return {
    recents,
    addRecentItem: add,
    removeRecentItem: remove,
    clearRecentItems: clear,
  };
}
