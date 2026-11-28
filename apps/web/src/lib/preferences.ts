'use client';

import { useCallback, useEffect, useState } from 'react';
import { BROWSER_STORAGE_KEYS, safeGetItem, safeSetItem } from './browser-storage';

export const USER_PREFERENCES_STORAGE_KEY = BROWSER_STORAGE_KEYS.USER_PREFERENCES;

export interface UserPreferences {
  keyboardShortcutsEnabled: boolean;
  commandPaletteEnabled: boolean;
}

export const DEFAULT_USER_PREFERENCES: UserPreferences = {
  keyboardShortcutsEnabled: true,
  commandPaletteEnabled: true,
};

export function getUserPreferences(): UserPreferences {
  const parsed = safeGetItem<Partial<UserPreferences> | null>(USER_PREFERENCES_STORAGE_KEY, null);
  return {
    keyboardShortcutsEnabled:
      typeof parsed?.keyboardShortcutsEnabled === 'boolean'
        ? parsed.keyboardShortcutsEnabled
        : DEFAULT_USER_PREFERENCES.keyboardShortcutsEnabled,
    commandPaletteEnabled:
      typeof parsed?.commandPaletteEnabled === 'boolean'
        ? parsed.commandPaletteEnabled
        : DEFAULT_USER_PREFERENCES.commandPaletteEnabled,
  };
}

export function setUserPreferences(patch: Partial<UserPreferences>): UserPreferences {
  const current = getUserPreferences();
  const updated: UserPreferences = {
    ...current,
    ...patch,
  };
  const result = safeSetItem(USER_PREFERENCES_STORAGE_KEY, updated);
  if (!result.success) return { ...DEFAULT_USER_PREFERENCES };
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('savitools-preferences-update'));
  }
  return updated;
}

export function isKeyboardShortcutsEnabled(): boolean {
  return getUserPreferences().keyboardShortcutsEnabled;
}

export function isCommandPaletteEnabled(): boolean {
  return getUserPreferences().commandPaletteEnabled;
}

export function toggleKeyboardShortcuts(enabled?: boolean): UserPreferences {
  const current = getUserPreferences();
  const next = typeof enabled === 'boolean' ? enabled : !current.keyboardShortcutsEnabled;
  return setUserPreferences({ keyboardShortcutsEnabled: next });
}

export function toggleCommandPalette(enabled?: boolean): UserPreferences {
  const current = getUserPreferences();
  const next = typeof enabled === 'boolean' ? enabled : !current.commandPaletteEnabled;
  return setUserPreferences({ commandPaletteEnabled: next });
}

export function useUserPreferences() {
  const [preferences, setPreferences] = useState<UserPreferences>(() => getUserPreferences());

  useEffect(() => {
    setPreferences(getUserPreferences());

    const handleUpdate = () => {
      setPreferences(getUserPreferences());
    };

    window.addEventListener('savitools-preferences-update', handleUpdate);
    window.addEventListener('storage', handleUpdate);

    return () => {
      window.removeEventListener('savitools-preferences-update', handleUpdate);
      window.removeEventListener('storage', handleUpdate);
    };
  }, []);

  const updatePreferences = useCallback((patch: Partial<UserPreferences>) => {
    const updated = setUserPreferences(patch);
    setPreferences(updated);
    return updated;
  }, []);

  const toggleKeyboardShortcuts = useCallback(() => {
    return updatePreferences({
      keyboardShortcutsEnabled: !preferences.keyboardShortcutsEnabled,
    });
  }, [preferences.keyboardShortcutsEnabled, updatePreferences]);

  const toggleCommandPalette = useCallback(() => {
    return updatePreferences({
      commandPaletteEnabled: !preferences.commandPaletteEnabled,
    });
  }, [preferences.commandPaletteEnabled, updatePreferences]);

  return {
    preferences,
    shortcutsEnabled: preferences.keyboardShortcutsEnabled && preferences.commandPaletteEnabled,
    updatePreferences,
    toggleKeyboardShortcuts,
    toggleCommandPalette,
  };
}
