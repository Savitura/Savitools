import { describe, it, expect } from '@jest/globals';
import { existsSync } from 'fs';
import { join } from 'path';
import { tools } from '@/lib/tools';

describe('Tool Registry Contract', () => {
  it('contains shipped tools with valid hrefs and descriptions', () => {
    expect(tools.length).toBeGreaterThan(0);
    for (const tool of tools) {
      expect(tool.href).toBeDefined();
      expect(tool.label).toBeDefined();
      expect(tool.description).toBeDefined();
      expect(tool.status).toBe('MVP');
    }
  });

  it('resolves every tool href to an existing page component route directory', () => {
    const localeAppDir = join(__dirname, '..', 'app', '[locale]');
    for (const tool of tools) {
      // e.g. /inspector -> app/[locale]/inspector/page.tsx or app/[locale]/inspector
      const cleanPath = tool.href.replace(/^\//, '');
      const routePath = join(localeAppDir, cleanPath);
      const pageFile = join(localeAppDir, cleanPath, 'page.tsx');

      const exists = existsSync(routePath) || existsSync(pageFile);
      expect(exists).toBe(true);
    }
  });

  it('includes both SDK Generator and Network Status', () => {
    const sdkTool = tools.find((t) => t.href === '/sdk');
    const networkTool = tools.find((t) => t.href === '/network');

    expect(sdkTool).toBeDefined();
    expect(sdkTool?.status).toBe('MVP');

    expect(networkTool).toBeDefined();
    expect(networkTool?.status).toBe('MVP');
  });
});
