'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useUserPreferences } from '@/lib/preferences';
import type { ContextualActions } from './types';

interface CommandPaletteContextValue {
  isOpen: boolean;
  openPalette: () => void;
  closePalette: () => void;
  togglePalette: () => void;
  contextualActions: ContextualActions | null;
  registerContextActions: (actions: ContextualActions) => () => void;
  shortcutsEnabled: boolean;
}

const CommandPaletteContext = createContext<CommandPaletteContextValue | null>(
  null,
);

export function CommandPaletteProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [contextualActions, setContextualActions] =
    useState<ContextualActions | null>(null);
  const contextualActionsRef = useRef<ContextualActions | null>(null);
  contextualActionsRef.current = contextualActions;

  const { shortcutsEnabled } = useUserPreferences();
  const shortcutsEnabledRef = useRef(shortcutsEnabled);
  shortcutsEnabledRef.current = shortcutsEnabled;

  const openPalette = useCallback(() => {
    if (!shortcutsEnabledRef.current) return;
    setIsOpen(true);
  }, []);

  const closePalette = useCallback(() => {
    setIsOpen(false);
  }, []);

  const togglePalette = useCallback(() => {
    if (!shortcutsEnabledRef.current) return;
    setIsOpen((prev) => !prev);
  }, []);

  const registerContextActions = useCallback(
    (actions: ContextualActions) => {
      setContextualActions(actions);
      return () => {
        setContextualActions((curr) => (curr === actions ? null : curr));
      };
    },
    [],
  );

  // Global keyboard shortcut listeners (Cmd/Ctrl+K, Cmd/Ctrl+Enter, Cmd/Ctrl+C)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!shortcutsEnabledRef.current) return;

      const isModifier = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();

      // 1. Cmd/Ctrl + K -> Toggle Command Palette
      if (isModifier && key === 'k') {
        e.preventDefault();
        setIsOpen((prev) => !prev);
        return;
      }

      // 2. Escape while palette is open
      if (key === 'escape' && isOpen) {
        e.preventDefault();
        setIsOpen(false);
        return;
      }

      // If palette is currently open, don't execute other background page shortcuts
      if (isOpen) {
        return;
      }

      // 3. Cmd/Ctrl + Enter -> Run Current Action (e.g. Inspect, Simulate, Send Webhook)
      if (isModifier && key === 'enter') {
        const active = contextualActionsRef.current;
        if (active?.runAction) {
          e.preventDefault();
          void active.runAction();
          return;
        }
      }

      // 4. Cmd/Ctrl + C -> Contextual Copy Selected Transaction Hash
      if (isModifier && key === 'c') {
        // IMPORTANT: NEVER hijack native copy when user has highlighted text on the page
        const selection =
          typeof window !== 'undefined'
            ? window.getSelection()?.toString()
            : '';
        if (selection && selection.trim().length > 0) {
          return; // Let browser do standard copy
        }

        const active = contextualActionsRef.current;
        if (active?.copyTxHash) {
          const handled = active.copyTxHash();
          if (handled) {
            e.preventDefault();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => {
      window.removeEventListener('keydown', handleKeyDown, { capture: true });
    };
  }, [isOpen]);

  return (
    <CommandPaletteContext.Provider
      value={{
        isOpen,
        openPalette,
        closePalette,
        togglePalette,
        contextualActions,
        registerContextActions,
        shortcutsEnabled,
      }}
    >
      {children}
    </CommandPaletteContext.Provider>
  );
}

export function useCommandPalette() {
  const context = useContext(CommandPaletteContext);
  if (!context) {
    throw new Error(
      'useCommandPalette must be used within a CommandPaletteProvider',
    );
  }
  return context;
}
