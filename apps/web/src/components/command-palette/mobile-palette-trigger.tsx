'use client';

import React from 'react';
import { Search } from 'lucide-react';
import { useCommandPalette } from './command-palette-context';
import { ShortcutBadge } from './shortcut-badge';

export function CommandPaletteTrigger() {
  const { openPalette, shortcutsEnabled } = useCommandPalette();

  return (
    <button
      type="button"
      onClick={openPalette}
      className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-border/80 bg-muted/40 hover:bg-muted/70 hover:border-foreground/30 text-muted-foreground hover:text-foreground text-xs transition-all select-none group"
      aria-label="Open command palette (Cmd+K)"
      title={
        shortcutsEnabled
          ? 'Open command palette (Cmd+K)'
          : 'Command palette is disabled in Settings'
      }
    >
      <Search className="h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />
      <span className="hidden md:inline font-sans text-xs text-muted-foreground/80 group-hover:text-foreground">
        Search tools & actions…
      </span>
      <ShortcutBadge shortcut="Cmd+K" className="hidden sm:inline-flex ml-1" />
    </button>
  );
}
