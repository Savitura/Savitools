import { readdirSync, statSync } from 'fs';
import { join, relative, sep } from 'path';

const APP_DIR = join(__dirname, '..', 'app');
const LOCALE_DIR = join(APP_DIR, '[locale]');

function collectPageRoutes(root: string, skipDirectory?: string): string[] {
  const routes: string[] = [];

  const walk = (directory: string) => {
    for (const entry of readdirSync(directory)) {
      if (entry === skipDirectory) continue;

      const fullPath = join(directory, entry);
      if (statSync(fullPath).isDirectory()) {
        walk(fullPath);
      } else if (entry === 'page.tsx') {
        routes.push(relative(root, directory).split(sep).join('/') || '/');
      }
    }
  };

  walk(root);
  return routes.sort();
}

describe('App Router locale parity', () => {
  const defaultRoutes = collectPageRoutes(APP_DIR, '[locale]');
  const localizedRoutes = collectPageRoutes(LOCALE_DIR);

  it('ships page routes in both the default and localized trees', () => {
    expect(defaultRoutes.length).toBeGreaterThan(0);
    expect(localizedRoutes.length).toBeGreaterThan(0);
    expect(defaultRoutes.filter((route) => !localizedRoutes.includes(route))).toEqual([]);
    expect(localizedRoutes.filter((route) => !defaultRoutes.includes(route))).toEqual([]);
  });
});
