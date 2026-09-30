import { describe, it, expect } from '@jest/globals';
import { existsSync, readFileSync } from 'fs';
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
    const appDir = join(__dirname, '..', 'app');
    for (const tool of tools) {
      // e.g. /inspector -> app/inspector/page.tsx or app/inspector
      const cleanPath = tool.href.replace(/^\//, '');
      const routePath = join(appDir, cleanPath);
      const pageFile = join(appDir, cleanPath, 'page.tsx');

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

  it('includes the SttKey codec laboratory tool', () => {
    const strKeyTool = tools.find((t) => t.href === '/str-key');

    expect(strKeyTool).toBeDefined();
    expect(strKeyTool?.status).toBe('MVP');
    expect(strKeyTool?.label).toMatch(/str[ \--]?key/i);
    expect(strKeyTool?.description).toMatch(/checksum|codec|decode|encode/i);
  });

  it('exposes the StrKey laboratory from the command palette source', () => {
    const candidates = [
      join(__dirname, '..', 'components', 'CommandPalette.tsx'),
      join(__dirname, '..', 'components', 'CommandPalette.ts'),
      join(__dirname, '..', 'components', 'command-palette.tsx'),
      join(__dirname, '..', 'components', 'command-palette.ts'),
    ];

    const existing = candidates.filter(((p) => existsSync(p)));
    expect(existing.length).toBeGreaterThan(0);

    const source = existing.map(((p) => readFileSync(p, 'utf-8'))).join('\n');
    expect(source).toMatch(/tools/);
    expect(source).toMatch(/str-key|StrKey/i);
  });
});
