'use client';

import { useCallback, useEffect, useState } from 'react';
import { getWorkspace, saveWorkspace, WorkspaceTool } from './api';
import { useAuth } from './auth-context';

function guestStorageKey(tool: WorkspaceTool): string {
  return `savitools:guest:${tool}`;
}

export function readGuestWorkspace<T>(tool: WorkspaceTool, fallback: T): T {
  if (typeof window === 'undefined') {
    return fallback;
  }

  const raw = window.localStorage.getItem(guestStorageKey(tool));
  if (!raw) {
    return fallback;
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeGuestWorkspace<T>(tool: WorkspaceTool, data: T): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(guestStorageKey(tool), JSON.stringify(data));
}

export function useWorkspaceState<T>(
  tool: WorkspaceTool,
  defaultValue: T,
) {
  const { user, loading } = useAuth();
  const [data, setData] = useState<T>(defaultValue);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (loading) {
      return;
    }

    let cancelled = false;

    async function loadWorkspace() {
      if (user) {
        try {
          const response = await getWorkspace(tool);
          if (!cancelled) {
            setData({ ...defaultValue, ...(response.data as T) });
          }
        } catch {
          if (!cancelled) {
            setData(defaultValue);
          }
        }
      } else if (!cancelled) {
        setData(readGuestWorkspace(tool, defaultValue));
      }

      if (!cancelled) {
        setReady(true);
      }
    }

    setReady(false);
    void loadWorkspace();

    return () => {
      cancelled = true;
    };
  }, [user, loading, tool, defaultValue]);

  const persist = useCallback(
    async (next: T) => {
      setData(next);

      if (user) {
        await saveWorkspace(tool, next as Record<string, unknown>);
      } else {
        writeGuestWorkspace(tool, next);
      }
    },
    [tool, user],
  );

  return { data, setData: persist, ready, isAuthenticated: Boolean(user) };
}
