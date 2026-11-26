import {
  BROWSER_STORAGE_KEYS,
  safeGetItem,
  safeSetItem,
} from '@/lib/browser-storage';
import type { DeployedContract } from '@/lib/api';

export const CONTRACT_HISTORY_LIMIT = 50;

export function loadContractHistory(): DeployedContract[] {
  const stored = safeGetItem<unknown>(BROWSER_STORAGE_KEYS.CONTRACTS_HISTORY, []);
  return Array.isArray(stored) ? (stored as DeployedContract[]) : [];
}

export function saveContractHistory(contracts: DeployedContract[]): boolean {
  const bounded = contracts.slice(0, CONTRACT_HISTORY_LIMIT);
  return safeSetItem(BROWSER_STORAGE_KEYS.CONTRACTS_HISTORY, bounded).success;
}
