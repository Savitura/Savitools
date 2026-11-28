import { readFileSync } from 'fs';
import { join } from 'path';

const SRC_DIR = join(__dirname, '..');

const STORAGE_MODULES = [
  'lib/recent-items.ts',
  'lib/theme-context.tsx',
  'lib/onboarding.ts',
  'lib/network-context.tsx',
  'lib/preferences.ts',
  'components/tools/federation-tool.tsx',
  'components/tools/composer/index.tsx',
  'components/tools/contracts-tool.tsx',
];

describe('browser storage access', () => {
  it.each(STORAGE_MODULES)('%s routes persistence through browser-storage.ts', (relativePath) => {
    const source = readFileSync(join(SRC_DIR, relativePath), 'utf8');

    expect(source).toMatch(/from ['"][^'"]*browser-storage['"]/);
    expect(source).not.toMatch(/\b(?:window\??\.)?localStorage\s*\./);
  });
});
