import type { LucideIcon } from 'lucide-react';

export type CommandCategory = 'recent' | 'tool' | 'action';

export interface CommandItem {
  id: string;
  category: CommandCategory;
  categoryLabel: string;
  title: string;
  subtitle?: string;
  keywords?: string[];
  icon: LucideIcon;
  href?: string;
  onSelect?: () => void | Promise<void>;
  shortcutBadge?: string;
  badge?: string;
}

export interface ContextualActions {
  copyTxHash?: () => boolean | Promise<boolean>;
  runAction?: () => void | Promise<void>;
  actionLabel?: string;
  txHash?: string;
}
