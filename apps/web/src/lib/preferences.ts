'use client';

import { useCallback, useEffect, useState } from 'react';

export const USER_PREFERENCES_STORAGE_KEY = 'savitools_user_preferences';

export interface UserPreferences {
  keyboardShortcutsEnabled: boolean;
  commandPaletteEnabled: boolean;
}

export const DEFAULT_USER_PREFERENCES: UserPreferences = {
  keyboardShortcutsEnabled: true,
  commandPaletteEnabled: true,
};

export function getUserPreferences(): UserPreferences {
  if (typeof window === 'undefined') return { ...DEFAULT_USER_PREFERENCES };
  try {
    const raw = localStorage.getItem(USER_PREFERENCES_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_USER_PREFERENCES };
    const parsed = JSON.parse(raw);
    return {
      keyboardShortcutsEnabled:
        typeof parsed.keyboardShortcutsEnabled === 'boolean'
          ? parsed.keyboardShortcutsEnabled
          : DEFAULT_USER_PREFERENCES.keyboardShortcutsEnabled,
      commandPaletteEnabled:
        typeof parsed.commandPaletteEnabled === 'boolean'
          ? parsed.commandPaletteEnabled
          : DEFAULT_USER_PREFERENCES.commandPaletteEnabled,
    };
  } catch {
    return { ...DEFAULT_USER_PREFERENCES };
  }
}

export function setUserPreferences(
  patch: Partial<UserPreferences>,
): UserPreferences {
  if (typeof window === 'undefined') return { ...DEFAULT_USER_PREFERENCES };
  try {
    const current = getUserPreferences();
    const updated: UserPreferences = {
      ...current,
      ...patch,
    };
    localStorage.setItem(
      USER_PREFERENCES_STORAGE_KEY,
      JSON.stringify(updated),
    );
    window.dispatchEvent(new CustomEvent('savitools-preferences-update'));
    return updated;
  } catch {
    return { ...DEFAULT_USER_PREFERENCES };
  }
}

export function isKeyboardShortcutsEnabled(): boolean {
  return getUserPreferences().keyboardShortcutsEnabled;
}

export function isCommandPaletteEnabled(): boolean {
  return getUserPreferences().commandPaletteEnabled;
}

export function toggleKeyboardShortcuts(enabled?: boolean): UserPreferences {
  const current = getUserPreferences();
  const next =
    typeof enabled === 'boolean' ? enabled : !current.keyboardShortcutsEnabled;
  return setUserPreferences({ keyboardShortcutsEnabled: next });
}

export function toggleCommandPalette(enabled?: boolean): UserPreferences {
  const current = getUserPreferences();
  const next =
    typeof enabled === 'boolean' ? enabled : !current.commandPaletteEnabled;
  return setUserPreferences({ commandPaletteEnabled: next });
}


export function useUserPreferences() {
  const [preferences, setPreferences] = useState<UserPreferences>(() =>
    getUserPreferences(),
  );

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

  const updatePreferences = useCallback(
    (patch: Partial<UserPreferences>) => {
      const updated = setUserPreferences(patch);
      setPreferences(updated);
      return updated;
    },
    [],
  );

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
    shortcutsEnabled:
      preferences.keyboardShortcutsEnabled && preferences.commandPaletteEnabled,
    updatePreferences,
    toggleKeyboardShortcuts,
    toggleCommandPalette,
  };
}
