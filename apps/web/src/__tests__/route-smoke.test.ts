import * as fs from 'fs';
import * as path from 'path';

// Mock next-intl/server so Jest can resolve src/i18n.ts under commonjs ts-jest
jest.mock('next-intl/server', () => ({
  getRequestConfig: (fn: any) => fn,
  getMessages: jest.fn().mockResolvedValue({}),
}));

import { tools } from '@/lib/tools';
import { locales } from '@/i18n';

const APP_DIR = path.resolve(__dirname, '..', 'app');
const LOCALE_DIR = path.join(APP_DIR, '[locale]');

function getRouteDirectories(baseDir: string): string[] {
  const routes: string[] = [];

  function walk(dir: string, currentRoute: string) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const hasPage = entries.some((e) => e.isFile() && /^page\.(tsx|jsx|js|ts)$/.test(e.name));

    if (hasPage) {
      routes.push(currentRoute || '/');
    }

    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (entry.name.startsWith('_') || entry.name.startsWith('.')) continue;
        if (entry.name === '[locale]') continue; // Skip locale root in recursive walk
        walk(
          path.join(dir, entry.name),
          currentRoute ? `${currentRoute}/${entry.name}` : `/${entry.name}`,
        );
      }
    }
  }

  walk(baseDir, '');
  return routes.sort();
}

describe('Next.js Route Smoke & Parity Contract', () => {
  it('every shipped tool in tools.ts resolves to a valid route page in app/', () => {
    for (const tool of tools) {
      const cleanPath = tool.href.replace(/^\//, '');
      const pageFile = path.join(APP_DIR, cleanPath, 'page.tsx');
      expect(fs.existsSync(pageFile)).toBe(true);
    }
  });

  it('every shipped tool in tools.ts resolves to a valid route page in app/[locale]/', () => {
    for (const tool of tools) {
      const cleanPath = tool.href.replace(/^\//, '');
      const pageFile = path.join(LOCALE_DIR, cleanPath, 'page.tsx');
      expect(fs.existsSync(pageFile)).toBe(true);
    }
  });

  it('maintains complete parity between non-localized app/ and localized app/[locale]/ routes', () => {
    const appRoutes = getRouteDirectories(APP_DIR);
    const localeRoutes = getRouteDirectories(LOCALE_DIR);

    // Dynamic param folders like docs/[tool] map across both
    expect(localeRoutes).toEqual(appRoutes);
  });

  it('verifies every tool page file exports a valid default export', async () => {
    const appRoutes = getRouteDirectories(APP_DIR);

    for (const route of appRoutes) {
      const cleanPath = route === '/' ? '' : route.replace(/^\//, '');
      const pagePath = path.join(APP_DIR, cleanPath, 'page.tsx');
      if (fs.existsSync(pagePath)) {
        const fileContent = fs.readFileSync(pagePath, 'utf8');
        expect(fileContent).toMatch(/export\s+(default\s+|{\s*default(\s+as\s+\w+)?\s*}\s*from)/);
      }

      const localePagePath = path.join(LOCALE_DIR, cleanPath, 'page.tsx');
      if (fs.existsSync(localePagePath)) {
        const localeContent = fs.readFileSync(localePagePath, 'utf8');
        expect(localeContent).toMatch(/export\s+(default\s+|{\s*default(\s+as\s+\w+)?\s*}\s*from)/);
      }
    }
  });

  it('configured locales include supported languages en and es', () => {
    expect(locales).toContain('en');
    expect(locales).toContain('es');
    expect(locales.length).toBeGreaterThanOrEqual(2);
  });
});
