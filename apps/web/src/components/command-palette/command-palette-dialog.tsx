'use client';

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useRouter } from 'next/navigation';
import {
  Activity,
  ArrowRightLeft,
  BookOpen,
  Check,
  Clock,
  Code2,
  Copy,
  Cpu,
  ExternalLink,
  Layers,
  Network,
  PlayCircle,
  Radio,
  Search,
  Settings2,
  ShieldCheck,
  Sliders,
  Sparkles,
  ToggleLeft,
  X,
  Zap,
} from 'lucide-react';
import { tools } from '@/lib/tools';
import { useRecentItems, type RecentItem } from '@/lib/recent-items';
import { useUserPreferences } from '@/lib/preferences';
import { fuzzyFilter } from '@/lib/fuzzy-search';
import { useNetwork } from '@/lib/network-context';
import { EXAMPLE_TX_HASH } from '@/lib/examples';
import { useCommandPalette } from './command-palette-context';
import { ShortcutBadge } from './shortcut-badge';
import type { CommandItem, CommandCategory } from './types';


function getToolIcon(href: string) {
  switch (href) {
    case '/inspector':
      return Search;
    case '/composer':
      return Sliders;
    case '/sandbox':
      return PlayCircle;
    case '/simulator':
      return ArrowRightLeft;
    case '/simulator/orderbook':
      return Activity;
    case '/inspector/federation':
      return ShieldCheck;
    case '/inspector/graph':
      return Network;
    case '/contracts':
      return Code2;
    case '/contracts/events':
      return Cpu;
    case '/webhooks':
      return Radio;
    case '/playground':
      return Layers;
    case '/monitor':
      return Activity;
    case '/sdk':
      return BookOpen;
    case '/settings':
      return Settings2;
    default:
      return Sparkles;
  }
}

export function CommandPaletteDialog() {
  const {
    isOpen,
    closePalette,
    contextualActions,
    shortcutsEnabled,
  } = useCommandPalette();
  const { recents, clearRecentItems } = useRecentItems();
  const { toggleKeyboardShortcuts } = useUserPreferences();
  const { network, setNetwork } = useNetwork();
  const router = useRouter();

  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [copiedMessage, setCopiedMessage] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  // Focus management: save previous focus on open, restore on close
  useEffect(() => {
    if (isOpen) {
      previousFocusRef.current = document.activeElement as HTMLElement;
      setQuery('');
      setSelectedIndex(0);

      // Autofocus input on next frame
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    } else {
      if (previousFocusRef.current && typeof previousFocusRef.current.focus === 'function') {
        previousFocusRef.current.focus();
      }
    }
  }, [isOpen]);

  // Build the complete list of static and dynamic command items
  const allItems: CommandItem[] = useMemo(() => {
    const list: CommandItem[] = [];

    // 1. Contextual and Quick Actions
    if (contextualActions?.copyTxHash || contextualActions?.txHash) {
      list.push({
        id: 'action-copy-tx',
        category: 'action',
        categoryLabel: 'Quick Actions',
        title: 'Copy Active Transaction Hash',
        subtitle: contextualActions.txHash
          ? `${contextualActions.txHash.slice(0, 16)}…`
          : 'Copy current transaction hash to clipboard',
        keywords: ['copy', 'hash', 'transaction', 'tx', 'clipboard'],
        icon: Copy,
        shortcutBadge: 'Cmd+C',
        onSelect: () => {
          if (contextualActions.copyTxHash) {
            contextualActions.copyTxHash();
          } else if (contextualActions.txHash) {
            void navigator.clipboard.writeText(contextualActions.txHash);
          }
          setCopiedMessage('Transaction hash copied!');
          setTimeout(() => setCopiedMessage(null), 1500);
        },
      });
    }

    if (contextualActions?.runAction) {
      list.push({
        id: 'action-run-current',
        category: 'action',
        categoryLabel: 'Quick Actions',
        title: contextualActions.actionLabel || 'Run Current Tool Action',
        subtitle: 'Execute primary action for active workstation tool',
        keywords: ['run', 'execute', 'submit', 'inspect', 'simulate'],
        icon: Zap,
        shortcutBadge: 'Cmd+Enter',
        onSelect: () => {
          void contextualActions.runAction?.();
        },
      });
    }

    list.push(
      {
        id: 'action-new-compose',
        category: 'action',
        categoryLabel: 'Quick Actions',
        title: 'New Visual Transaction (Composer)',
        subtitle: 'Open composer to build multi-operation transactions',
        keywords: ['composer', 'transaction', 'build', 'sign', 'xdr'],
        icon: Sliders,
        href: '/composer',
      },
      {
        id: 'action-sandbox-keypair',
        category: 'action',
        categoryLabel: 'Quick Actions',
        title: 'Create Sandbox Testnet Keypair',
        subtitle: 'Generate and fund a test wallet in one click',
        keywords: ['sandbox', 'keypair', 'wallet', 'fund', 'testnet', 'keys'],
        icon: PlayCircle,
        href: '/sandbox',
      },
      {
        id: 'action-new-webhook-test',
        category: 'action',
        categoryLabel: 'Quick Actions',
        title: 'Test Webhook Payload',
        subtitle: 'Send test event payload to your webhook destination',
        keywords: ['webhook', 'test', 'payload', 'fluxa', 'crowdpay'],
        icon: Radio,
        href: '/webhooks',
      },
      {
        id: 'action-inspect-example',
        category: 'action',
        categoryLabel: 'Quick Actions',
        title: 'Inspect Example Stellar Transaction',
        subtitle: 'Decode sample testnet transaction breakdown',
        keywords: ['example', 'demo', 'inspect', 'hash', 'stellar'],
        icon: Search,
        href: `/inspector?hash=${EXAMPLE_TX_HASH}&example=1`,
      },
      {
        id: 'action-toggle-network',
        category: 'action',
        categoryLabel: 'Quick Actions',
        title: `Switch Network to ${network === 'testnet' ? 'Mainnet' : 'Testnet'}`,
        subtitle: `Currently connected to Stellar ${network}`,
        keywords: ['network', 'testnet', 'mainnet', 'switch', 'horizon'],
        icon: ArrowRightLeft,
        badge: network,
        onSelect: () => {
          setNetwork(network === 'testnet' ? 'mainnet' : 'testnet');
        },
      },
      {
        id: 'action-toggle-shortcuts',
        category: 'action',
        categoryLabel: 'Quick Actions',
        title: `${shortcutsEnabled ? 'Disable' : 'Enable'} Keyboard Shortcuts`,
        subtitle: 'Toggle command palette and keyboard shortcuts preference',
        keywords: ['shortcuts', 'keyboard', 'preferences', 'settings', 'disable', 'enable'],
        icon: ToggleLeft,
        onSelect: () => {
          toggleKeyboardShortcuts();
        },
      },
    );

    // 2. Recent Items
    for (const recent of recents) {
      list.push({
        id: `recent-${recent.id}`,
        category: 'recent',
        categoryLabel: 'Recent Items',
        title: recent.title,
        subtitle:
          recent.subtitle ||
          `Recent ${recent.category} item · ${new Date(recent.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
        keywords: ['recent', recent.category, recent.title, recent.subtitle || ''],
        icon: Clock,
        href: recent.href,
      });
    }

    // 3. Navigation / Tools List
    for (const tool of tools) {
      list.push({
        id: `tool-${tool.href}`,
        category: 'tool',
        categoryLabel: 'Workstation Tools',
        title: tool.label,
        subtitle: tool.description,
        keywords: [tool.label, tool.description, tool.status, tool.href.replace('/', '')],
        icon: getToolIcon(tool.href),
        href: tool.href,
        badge: tool.status,
      });
    }

    // Include settings link
    list.push({
      id: 'tool-settings',
      category: 'tool',
      categoryLabel: 'Workstation Tools',
      title: 'Settings & Integrations',
      subtitle: 'Manage connected accounts, API key vault, and keyboard shortcuts',
      keywords: ['settings', 'preferences', 'vault', 'fluxa', 'keys', 'sessions'],
      icon: Settings2,
      href: '/settings',
    });

    return list;
  }, [contextualActions, network, recents, setNetwork, shortcutsEnabled, toggleKeyboardShortcuts]);

  // Filter items using fuzzy search
  const filteredItems = useMemo(() => {
    return fuzzyFilter(allItems, query, {
      getTexts: (item) => [
        item.title,
        item.subtitle || '',
        ...(item.keywords || []),
        item.categoryLabel,
      ],
      getWeight: (_item, index) => {
        // Title has highest weight
        if (index === 0) return 2.0;
        // Subtitle
        if (index === 1) return 1.2;
        return 1.0;
      },
    });
  }, [allItems, query]);

  // Group items by category while preserving scoring order
  const { groupedItems, flatFilteredList } = useMemo(() => {
    const flat = filteredItems;
    const groups: { label: string; items: CommandItem[] }[] = [];
    const categoryOrder: CommandCategory[] = ['action', 'recent', 'tool'];

    if (!query.trim()) {
      // Unqueried: group by logical sections
      const actions = flat.filter((i) => i.category === 'action');
      const recentsList = flat.filter((i) => i.category === 'recent');
      const toolsList = flat.filter((i) => i.category === 'tool');

      if (actions.length > 0) groups.push({ label: 'Quick Actions', items: actions });
      if (recentsList.length > 0) groups.push({ label: 'Recent Items', items: recentsList });
      if (toolsList.length > 0) groups.push({ label: 'Workstation Tools', items: toolsList });
    } else {
      // Queried: maintain ranked order in groups
      const seen = new Set<string>();
      for (const item of flat) {
        if (!seen.has(item.categoryLabel)) {
          seen.add(item.categoryLabel);
          groups.push({
            label: item.categoryLabel,
            items: flat.filter((i) => i.categoryLabel === item.categoryLabel),
          });
        }
      }
    }

    return { groupedItems: groups, flatFilteredList: flat };
  }, [filteredItems, query]);

  // Ensure selected index stays within valid range
  useEffect(() => {
    setSelectedIndex((curr) => {
      if (flatFilteredList.length === 0) return 0;
      return Math.min(curr, flatFilteredList.length - 1);
    });
  }, [flatFilteredList.length]);

  // Scroll active item into view
  useEffect(() => {
    if (!isOpen) return;
    const activeEl = document.getElementById(
      `palette-item-${flatFilteredList[selectedIndex]?.id}`,
    );
    if (activeEl && listRef.current) {
      activeEl.scrollIntoView({ block: 'nearest' });
    }
  }, [isOpen, selectedIndex, flatFilteredList]);

  // Handle item selection
  const handleSelect = useCallback(
    (item: CommandItem) => {
      closePalette();
      if (item.onSelect) {
        void item.onSelect();
      } else if (item.href) {
        router.push(item.href);
      }
    },
    [closePalette, router],
  );

  // Keyboard navigation within the dialog
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (flatFilteredList.length === 0) {
        if (e.key === 'Escape') {
          e.preventDefault();
          closePalette();
        }
        return;
      }

      switch (e.key) {
        case 'ArrowDown': {
          e.preventDefault();
          setSelectedIndex((prev) => (prev + 1) % flatFilteredList.length);
          break;
        }
        case 'ArrowUp': {
          e.preventDefault();
          setSelectedIndex((prev) =>
            prev <= 0 ? flatFilteredList.length - 1 : prev - 1,
          );
          break;
        }
        case 'Home': {
          e.preventDefault();
          setSelectedIndex(0);
          break;
        }
        case 'End': {
          e.preventDefault();
          setSelectedIndex(flatFilteredList.length - 1);
          break;
        }
        case 'Enter': {
          e.preventDefault();
          const selected = flatFilteredList[selectedIndex];
          if (selected) {
            handleSelect(selected);
          }
          break;
        }
        case 'Escape': {
          e.preventDefault();
          closePalette();
          break;
        }
      }
    },
    [flatFilteredList, selectedIndex, handleSelect, closePalette],
  );

  // Tab trapping inside dialog
  const handleDialogKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    },
    [],
  );

  if (!isOpen) return null;

  const currentSelectedItem = flatFilteredList[selectedIndex];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Command Palette"
      onKeyDown={handleDialogKeyDown}
      className="fixed inset-0 z-50 flex items-start justify-center p-0 sm:p-4 sm:pt-[10vh] bg-black/70 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          closePalette();
        }
      }}
    >
      <div
        className="relative flex flex-col w-full h-full sm:h-auto sm:max-h-[80vh] sm:max-w-2xl bg-card border sm:border-border sm:rounded-xl shadow-2xl overflow-hidden border-border/80"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header / Search Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-background/80 shrink-0">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden="true" />
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-haspopup="listbox"
            aria-autocomplete="list"
            aria-controls="command-palette-list"
            aria-activedescendant={
              currentSelectedItem ? `palette-item-${currentSelectedItem.id}` : undefined
            }
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Type a command, jump to tool, or search recents…"
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/60 outline-hidden font-sans"
            spellCheck={false}
          />
          {query ? (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                inputRef.current?.focus();
              }}
              className="p-1 text-muted-foreground hover:text-foreground rounded transition-colors"
              aria-label="Clear search query"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
          <button
            type="button"
            onClick={closePalette}
            className="sm:hidden p-1 text-muted-foreground hover:text-foreground rounded transition-colors"
            aria-label="Close command palette"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Feedback alert (e.g. copied tx hash) */}
        {copiedMessage ? (
          <div className="px-4 py-1.5 bg-emerald-500/15 border-b border-emerald-500/30 text-emerald-400 text-xs flex items-center gap-2">
            <Check className="h-3.5 w-3.5" />
            {copiedMessage}
          </div>
        ) : null}

        {/* Results List */}
        <div
          ref={listRef}
          id="command-palette-list"
          role="listbox"
          aria-label="Commands and suggestions"
          className="flex-1 overflow-y-auto p-2 space-y-4"
        >
          {flatFilteredList.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              <p className="font-medium text-foreground/80 mb-1">
                No matching commands or tools
              </p>
              <p className="text-xs">
                Try searching for “inspector”, “composer”, “sandbox”, or “network”
              </p>
            </div>
          ) : (
            groupedItems.map((group) => (
              <div key={group.label} className="space-y-1">
                <div className="px-2 py-1 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                  <span>{group.label}</span>
                  {group.label === 'Recent Items' && recents.length > 0 && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        clearRecentItems();
                      }}
                      className="text-[10px] text-muted-foreground hover:text-destructive transition-colors lowercase font-normal"
                    >
                      clear
                    </button>
                  )}
                </div>

                <div className="space-y-0.5">
                  {group.items.map((item) => {
                    const itemFlatIndex = flatFilteredList.findIndex(
                      (i) => i.id === item.id,
                    );
                    const isSelected = itemFlatIndex === selectedIndex;
                    const Icon = item.icon;

                    return (
                      <div
                        key={item.id}
                        id={`palette-item-${item.id}`}
                        role="option"
                        aria-selected={isSelected}
                        onClick={() => handleSelect(item)}
                        onMouseEnter={() => setSelectedIndex(itemFlatIndex)}
                        className={`flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg text-sm cursor-pointer transition-colors select-none ${
                          isSelected
                            ? 'bg-violet-500/15 text-violet-200 border border-violet-500/30'
                            : 'text-foreground/90 hover:bg-muted/50 border border-transparent'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className={`p-1.5 rounded-md shrink-0 ${
                              isSelected
                                ? 'bg-violet-500/20 text-violet-300'
                                : 'bg-muted text-muted-foreground'
                            }`}
                          >
                            <Icon className="h-4 w-4" aria-hidden="true" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-medium truncate">
                                {item.title}
                              </span>
                              {item.badge ? (
                                <span className="text-[10px] uppercase font-mono px-1.5 py-0.2 rounded border border-border/80 text-muted-foreground bg-muted/30">
                                  {item.badge}
                                </span>
                              ) : null}
                            </div>
                            {item.subtitle ? (
                              <p className="text-xs text-muted-foreground truncate">
                                {item.subtitle}
                              </p>
                            ) : null}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {item.shortcutBadge ? (
                            <ShortcutBadge shortcut={item.shortcutBadge} />
                          ) : null}
                          {item.href ? (
                            <ExternalLink className="h-3.5 w-3.5 text-muted-foreground/40 hidden sm:inline" />
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer / Navigation Hints */}
        <div className="px-4 py-2 border-t border-border bg-background/50 text-[11px] text-muted-foreground flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="hidden sm:flex items-center gap-3">
            <span className="flex items-center gap-1">
              <ShortcutBadge shortcut="↑↓" className="px-1" />
              <span>navigate</span>
            </span>
            <span className="flex items-center gap-1">
              <ShortcutBadge shortcut="↵" className="px-1" />
              <span>select</span>
            </span>
            <span className="flex items-center gap-1">
              <ShortcutBadge shortcut="esc" className="px-1" />
              <span>close</span>
            </span>
          </div>

          <div className="flex items-center gap-2 ml-auto text-xs">
            <span className="text-muted-foreground/60">SaviTools Workstation</span>
          </div>
        </div>
      </div>
    </div>
  );
}
