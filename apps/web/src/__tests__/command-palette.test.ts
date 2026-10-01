// Headless suites for the command palette's pure logic. The palette's own
// keyboard/ARIA behaviour is covered by command-palette-dialog.test.tsx and
// command-palette-shortcuts.test.tsx, which mount the real components.
// Test fuzzy search utility
import { fuzzyScore, fuzzyFilter } from '../lib/fuzzy-search';

// Test recent items utility
import {
  getRecentItems,
  addRecentItem,
  removeRecentItem,
  clearRecentItems,
  RECENT_ITEMS_STORAGE_KEY,
  RecentItem,
} from '../lib/recent-items';

// Test user preferences utility
import {
  getUserPreferences,
  setUserPreferences,
  toggleKeyboardShortcuts,
  toggleCommandPalette,
  USER_PREFERENCES_STORAGE_KEY,
} from '../lib/preferences';


// Mock Browser Environment for localStorage and Window Events
class LocalStorageMock {
  private store: Record<string, string> = {};

  getItem(key: string): string | null {
    return this.store[key] ?? null;
  }

  setItem(key: string, value: string): void {
    this.store[key] = String(value);
  }

  removeItem(key: string): void {
    delete this.store[key];
  }

  clear(): void {
    this.store = {};
  }
}

class MockCustomEvent {
  type: string;
  detail: unknown;
  constructor(type: string, options?: { detail?: unknown }) {
    this.type = type;
    this.detail = options?.detail;
  }
}

// Setup simulated window environment
const localStorageMock = new LocalStorageMock();
const eventListeners: Record<string, ((event: any) => void)[]> = {};

const windowMock = {
  localStorage: localStorageMock,
  addEventListener: (event: string, handler: (e: any) => void) => {
    if (!eventListeners[event]) eventListeners[event] = [];
    eventListeners[event].push(handler);
  },
  removeEventListener: (event: string, handler: (e: any) => void) => {
    if (!eventListeners[event]) return;
    eventListeners[event] = eventListeners[event].filter((h) => h !== handler);
  },
  dispatchEvent: (event: any) => {
    const handlers = eventListeners[event.type] || [];
    for (const h of handlers) h(event);
    return true;
  },
  getSelection: () => ({
    toString: () => '',
  }),
  navigator: {
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
    clipboard: {
      writeText: async (_text: string) => {},
    },
  },
};

(global as any).window = windowMock;
(global as any).localStorage = localStorageMock;
(global as any).CustomEvent = MockCustomEvent;
(global as any).navigator = windowMock.navigator;

// ─── 1. FUZZY SEARCH TESTS ──────────────────────────────────────────────────

describe('Fuzzy Search Utility', () => {
  it('returns highest score (1000) for exact match (case insensitive)', () => {
    const score = fuzzyScore('Inspector', 'inspector');
    expect(score).toBe(1000);
  });


  it('scores prefix matches higher than internal substring matches', () => {
    const prefixScore = fuzzyScore('Transaction Inspector', 'Trans');
    const midScore = fuzzyScore('Inspect Transaction', 'Trans');
    expect(prefixScore).toBeGreaterThan(midScore);
  });

  it('scores acronyms and word initials properly (e.g., "ce" -> "Contract Events")', () => {
    const acronymScore = fuzzyScore('Contract Events', 'ce');
    expect(acronymScore).toBeGreaterThan(0.4);
  });

  it('returns 0 for non-matching queries', () => {
    const score = fuzzyScore('Transaction Inspector', 'xyz123');
    expect(score).toBe(0);
  });

  it('handles empty query with score 1.0', () => {
    const score = fuzzyScore('Transaction Inspector', '');
    expect(score).toBe(1.0);
  });

  it('filters and sorts lists correctly by relevance score', () => {
    const list = [
      { id: '1', title: 'Federation Server', desc: 'Resolve federation addresses' },
      { id: '2', title: 'Transaction Inspector', desc: 'Inspect operations and ledgers' },
      { id: '3', title: 'Inspect in Horizon', desc: 'Horizon explorer' },
    ];

    const filtered = fuzzyFilter(list, 'inspect', (item) => `${item.title} ${item.desc}`);
    expect(filtered.length).toBe(2);
    // 'Inspect in Horizon' starts with Inspect, so title prefix should rank first
    expect(filtered[0].id).toBe('3');
    expect(filtered[1].id).toBe('2');
  });

  it('supports fuzzy substring match where letters appear in order', () => {
    const score = fuzzyScore('Simulator Orderbook', 'so');
    expect(score).toBeGreaterThan(0);
  });
});

// ─── 2. RECENT ITEMS PERSISTENCE TESTS ──────────────────────────────────────

describe('Recent Items Persistence', () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  it('returns empty array when nothing is stored', () => {
    const items = getRecentItems();
    expect(items).toEqual([]);
  });

  it('adds recent item and persists to localStorage', () => {
    const item: Omit<RecentItem, 'id' | 'timestamp'> = {
      title: 'Inspect Tx: 0x1234',
      subtitle: '1 operation · testnet',
      href: '/inspector?hash=0x1234',
      category: 'inspector',
    };

    const added = addRecentItem(item);
    expect(added.id).toBeDefined();
    expect(added.timestamp).toBeDefined();
    expect(added.title).toBe('Inspect Tx: 0x1234');

    const stored = getRecentItems();
    expect(stored.length).toBe(1);
    expect(stored[0].title).toBe('Inspect Tx: 0x1234');
  });

  it('deduplicates items with identical href, moving the most recent to the top', () => {
    addRecentItem({
      title: 'Inspect Tx: 0x1111',
      subtitle: 'testnet',
      href: '/inspector?hash=0x1111',
      category: 'inspector',
    });

    addRecentItem({
      title: 'Inspect Tx: 0x2222',
      subtitle: 'testnet',
      href: '/inspector?hash=0x2222',
      category: 'inspector',
    });

    // Add 0x1111 again
    addRecentItem({
      title: 'Inspect Tx: 0x1111 Updated',
      subtitle: 'testnet',
      href: '/inspector?hash=0x1111',
      category: 'inspector',
    });

    const stored = getRecentItems();
    expect(stored.length).toBe(2);
    expect(stored[0].href).toBe('/inspector?hash=0x1111');
    expect(stored[0].title).toBe('Inspect Tx: 0x1111 Updated');
    expect(stored[1].href).toBe('/inspector?hash=0x2222');
  });

  it('caps total recent items at MAX_RECENT_ITEMS (10 items)', () => {
    for (let i = 1; i <= 15; i++) {
      addRecentItem({
        title: `Item ${i}`,
        href: `/tool/${i}`,
        category: 'general',
      });
    }

    const stored = getRecentItems();
    expect(stored.length).toBe(10);
    expect(stored[0].title).toBe('Item 15');
    expect(stored[9].title).toBe('Item 6');
  });

  it('removes a specific item by ID', () => {
    const item1 = addRecentItem({ title: 'Item 1', href: '/1', category: 'general' });
    const item2 = addRecentItem({ title: 'Item 2', href: '/2', category: 'general' });

    removeRecentItem(item1.id);
    const stored = getRecentItems();
    expect(stored.length).toBe(1);
    expect(stored[0].id).toBe(item2.id);
  });

  it('clears all recent items', () => {
    addRecentItem({ title: 'Item 1', href: '/1', category: 'general' });
    addRecentItem({ title: 'Item 2', href: '/2', category: 'general' });

    clearRecentItems();
    expect(getRecentItems()).toEqual([]);
  });

  it('handles corrupted localStorage JSON gracefully without throwing', () => {
    localStorageMock.setItem(RECENT_ITEMS_STORAGE_KEY, '{invalid-json');
    const items = getRecentItems();
    expect(items).toEqual([]);
  });
});

// ─── 3. USER PREFERENCES PERSISTENCE TESTS ──────────────────────────────────

describe('User Preferences Management', () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  it('returns default preferences when none are saved', () => {
    const prefs = getUserPreferences();
    expect(prefs.keyboardShortcutsEnabled).toBe(true);
    expect(prefs.commandPaletteEnabled).toBe(true);
  });

  it('persists modified preferences to localStorage', () => {
    setUserPreferences({
      keyboardShortcutsEnabled: false,
      commandPaletteEnabled: false,
    });

    const prefs = getUserPreferences();
    expect(prefs.keyboardShortcutsEnabled).toBe(false);
    expect(prefs.commandPaletteEnabled).toBe(false);
  });

  it('toggles keyboard shortcuts preference individually', () => {
    expect(getUserPreferences().keyboardShortcutsEnabled).toBe(true);
    const updated = toggleKeyboardShortcuts(false);
    expect(updated.keyboardShortcutsEnabled).toBe(false);
    expect(getUserPreferences().keyboardShortcutsEnabled).toBe(false);
  });

  it('toggles command palette preference individually', () => {
    expect(getUserPreferences().commandPaletteEnabled).toBe(true);
    const updated = toggleCommandPalette(false);
    expect(updated.commandPaletteEnabled).toBe(false);
    expect(getUserPreferences().commandPaletteEnabled).toBe(false);
  });

  it('handles corrupted preferences storage gracefully', () => {
    localStorageMock.setItem(USER_PREFERENCES_STORAGE_KEY, 'corrupted-data[');
    const prefs = getUserPreferences();
    expect(prefs.keyboardShortcutsEnabled).toBe(true);
    expect(prefs.commandPaletteEnabled).toBe(true);
  });

});
