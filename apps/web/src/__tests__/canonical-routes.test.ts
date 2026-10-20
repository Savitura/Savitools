import fs from 'node:fs';
import path from 'node:path';
import { tools } from '@/lib/tools';

describe('Canonical localized page tree (Issue #430)', () => {
  const appDir = path.resolve(__dirname, '../app');
  const localeDir = path.resolve(appDir, '[locale]');
  const messagesDir = path.resolve(__dirname, '../../messages');

  it('eliminates duplicated page routes from root app directory', () => {
    const entries = fs.readdirSync(appDir);
    // Only root layout, root globals.css, and [locale] dynamic segment are allowed
    const allowedRootEntries = ['[locale]', 'globals.css', 'layout.tsx'];
    const unexpectedEntries = entries.filter((e) => !allowedRootEntries.includes(e));

    expect(unexpectedEntries).toEqual([]);
  });

  it('contains the canonical home page under [locale]', () => {
    expect(fs.existsSync(path.join(localeDir, 'page.tsx'))).toBe(true);
  });

  it('has migrated all previously outside-only routes into [locale]', () => {
    const outsideOnlyRoutes = [
      'liquidity-pools',
      'multisig',
      'qr-handoff',
      'rpc',
      'simulator/path-payment-lab',
    ];

    for (const route of outsideOnlyRoutes) {
      const pagePath = path.join(localeDir, route, 'page.tsx');
      expect(fs.existsSync(pagePath)).toBe(true);
    }
  });

  it('preserves all routes that existed only inside [locale]', () => {
    const insideOnlyRoutes = ['sep10', 'sequence-planner', 'soroban-storage', 'stellar-toml'];

    for (const route of insideOnlyRoutes) {
      const pagePath = path.join(localeDir, route, 'page.tsx');
      expect(fs.existsSync(pagePath)).toBe(true);
    }
  });

  it('ensures every tool href in lib/tools resolves to a canonical page in [locale]', () => {
    for (const tool of tools) {
      // e.g. "/composer" -> "composer", "/simulator/path-payment-lab" -> "simulator/path-payment-lab"
      const relativeRoute = tool.href.replace(/^\//, '');
      const pagePath = path.join(localeDir, relativeRoute, 'page.tsx');
      expect(fs.existsSync(pagePath)).toBe(true);
    }
  });

  it('verifies supported locale catalogues exist', () => {
    const messageFiles = fs.readdirSync(messagesDir);
    expect(messageFiles).toContain('en.json');
    expect(messageFiles).toContain('es.json');
  });
});
