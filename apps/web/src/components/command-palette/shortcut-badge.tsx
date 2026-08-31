'use client';

import { useEffect, useState } from 'react';

interface ShortcutBadgeProps {
  shortcut: string;
  className?: string;
}

export function isApplePlatform(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return false;
  }
  const platform =
    (navigator as unknown as { userAgentData?: { platform?: string } })
      ?.userAgentData?.platform ||
    navigator.platform ||
    navigator.userAgent ||
    '';
  return /Mac|iPhone|iPod|iPad/i.test(platform);
}

export function formatShortcut(shortcut: string, isMac: boolean): string {
  if (!shortcut) return '';

  let res = shortcut;
  if (isMac) {
    res = res
      .replace(/Cmd|Command|Meta/gi, '⌘')
      .replace(/Ctrl|Control/gi, '⌃')
      .replace(/Alt|Option/gi, '⌥')
      .replace(/Shift/gi, '⇧')
      .replace(/Enter|Return/gi, '↵')
      .replace(/\+/g, ' ');
  } else {
    res = res
      .replace(/Cmd|Meta/gi, 'Ctrl')
      .replace(/Option/gi, 'Alt')
      .replace(/Return/gi, 'Enter');
  }

  return res;
}

export function ShortcutBadge({ shortcut, className = '' }: ShortcutBadgeProps) {
  const [isMac, setIsMac] = useState(false);

  useEffect(() => {
    setIsMac(isApplePlatform());
  }, []);

  const formatted = formatShortcut(shortcut, isMac);

  return (
    <kbd
      className={`inline-flex items-center gap-0.5 rounded border border-border/80 bg-muted/60 px-1.5 py-0.5 font-mono text-[10px] font-medium text-muted-foreground shadow-xs select-none ${className}`}
      aria-label={`Keyboard shortcut: ${shortcut}`}
    >
      {formatted}
    </kbd>
  );
}
