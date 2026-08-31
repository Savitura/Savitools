'use client';

import { useCallback, useEffect, useState } from 'react';

export const RECENT_ITEMS_STORAGE_KEY = 'savitools_recent_items';
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
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(RECENT_ITEMS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

export function saveRecentItems(items: RecentItem[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(RECENT_ITEMS_STORAGE_KEY, JSON.stringify(items));
    window.dispatchEvent(new CustomEvent('savitools-recent-update'));
  } catch {
    // ignore localStorage errors (e.g. quota)
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
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(RECENT_ITEMS_STORAGE_KEY);
    window.dispatchEvent(new CustomEvent('savitools-recent-update'));
  } catch {
    // ignore
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
