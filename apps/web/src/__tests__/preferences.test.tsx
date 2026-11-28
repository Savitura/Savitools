import { act, renderHook } from '@testing-library/react';
import {
  DEFAULT_USER_PREFERENCES,
  getUserPreferences,
  isCommandPaletteEnabled,
  isKeyboardShortcutsEnabled,
  setUserPreferences,
  toggleCommandPalette,
  toggleKeyboardShortcuts,
  useUserPreferences,
  USER_PREFERENCES_STORAGE_KEY,
} from '@/lib/preferences';

describe('preferences', () => {
  beforeEach(() => {
    window.localStorage.clear();
    jest.restoreAllMocks();
  });

  it('returns defaults when the key is missing, corrupted, or not an object', () => {
    expect(getUserPreferences()).toEqual(DEFAULT_USER_PREFERENCES);

    window.localStorage.setItem(USER_PREFERENCES_STORAGE_KEY, '{broken');
    expect(getUserPreferences()).toEqual(DEFAULT_USER_PREFERENCES);

    window.localStorage.setItem(USER_PREFERENCES_STORAGE_KEY, 'null');
    expect(getUserPreferences()).toEqual(DEFAULT_USER_PREFERENCES);
  });

  it('repairs non-boolean and partial stored values with defaults', () => {
    window.localStorage.setItem(
      USER_PREFERENCES_STORAGE_KEY,
      JSON.stringify({ keyboardShortcutsEnabled: 'yes', commandPaletteEnabled: false }),
    );

    expect(getUserPreferences()).toEqual({
      keyboardShortcutsEnabled: true,
      commandPaletteEnabled: false,
    });

    window.localStorage.setItem(USER_PREFERENCES_STORAGE_KEY, JSON.stringify({}));
    expect(getUserPreferences()).toEqual(DEFAULT_USER_PREFERENCES);
  });

  it('merges patches, persists them, and dispatches an update event', () => {
    const onUpdate = jest.fn();
    window.addEventListener('savitools-preferences-update', onUpdate);

    const updated = setUserPreferences({ commandPaletteEnabled: false });

    expect(updated).toEqual({
      keyboardShortcutsEnabled: true,
      commandPaletteEnabled: false,
    });
    expect(getUserPreferences()).toEqual(updated);
    expect(onUpdate).toHaveBeenCalledTimes(1);

    window.removeEventListener('savitools-preferences-update', onUpdate);
  });

  it('returns defaults without throwing when localStorage is unavailable', () => {
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('Storage blocked');
    });
    expect(getUserPreferences()).toEqual(DEFAULT_USER_PREFERENCES);

    jest.restoreAllMocks();
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Storage blocked');
    });
    expect(setUserPreferences({ commandPaletteEnabled: false })).toEqual(DEFAULT_USER_PREFERENCES);
  });

  it('toggles individual flags or applies an explicit value', () => {
    expect(toggleKeyboardShortcuts()).toEqual({
      keyboardShortcutsEnabled: false,
      commandPaletteEnabled: true,
    });
    expect(toggleKeyboardShortcuts(true).keyboardShortcutsEnabled).toBe(true);
    expect(isKeyboardShortcutsEnabled()).toBe(true);

    expect(toggleCommandPalette()).toEqual({
      keyboardShortcutsEnabled: true,
      commandPaletteEnabled: false,
    });
    expect(toggleCommandPalette(true).commandPaletteEnabled).toBe(true);
    expect(isCommandPaletteEnabled()).toBe(true);
  });

  it('keeps the hook in sync with local updates and storage events', () => {
    const { result } = renderHook(() => useUserPreferences());

    expect(result.current.preferences).toEqual(DEFAULT_USER_PREFERENCES);
    expect(result.current.shortcutsEnabled).toBe(true);

    act(() => {
      result.current.updatePreferences({ keyboardShortcutsEnabled: false });
    });
    expect(result.current.shortcutsEnabled).toBe(false);

    window.localStorage.setItem(
      USER_PREFERENCES_STORAGE_KEY,
      JSON.stringify({ commandPaletteEnabled: false }),
    );
    act(() => {
      window.dispatchEvent(new StorageEvent('storage'));
    });
    expect(result.current.preferences).toEqual({
      keyboardShortcutsEnabled: true,
      commandPaletteEnabled: false,
    });

    act(() => {
      result.current.toggleCommandPalette();
    });
    expect(result.current.preferences.commandPaletteEnabled).toBe(true);
  });
});
