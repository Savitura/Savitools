import {
  BROWSER_STORAGE_KEYS,
  safeGetItem,
  safeSetItem,
} from '@/lib/browser-storage';
import type { Workspace } from './composer-types';

export function loadComposerWorkspaces(): Workspace[] {
  const stored = safeGetItem<unknown>(BROWSER_STORAGE_KEYS.LEGACY_COMPOSER_WORKSPACES, []);
  return Array.isArray(stored) ? (stored as Workspace[]) : [];
}

export function saveComposerWorkspaces(workspaces: Workspace[]): boolean {
  return safeSetItem(BROWSER_STORAGE_KEYS.LEGACY_COMPOSER_WORKSPACES, workspaces).success;
}
