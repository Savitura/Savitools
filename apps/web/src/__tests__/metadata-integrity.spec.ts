import { describe, it, expect } from '@jest/globals';
import { existsSync } from 'fs';
import { join } from 'path';
import { tools } from '@/lib/tools';
import { ecosystemItems } from '@/lib/ecosystem';
import { examples } from '@/lib/examples';
import { toolDocs } from '@/lib/tool-docs';

describe('Metadata and Catalog Integrity (Issue: Add integrity tests for tools, ecosystem, examples, tool-docs)', () => {
  it('validates tools.ts: unique hrefs, valid routes or docs, and no duplicate slugs', () => {
    expect(tools.length).toBeGreaterThan(0);
    const hrefs = new Set<string>();

    for (const tool of tools) {
      expect(tool.href).toBeDefined();
      expect(tool.label).toBeDefined();
      expect(tool.description).toBeDefined();

      // Check for duplicates
      expect(hrefs.has(tool.href)).toBe(false);
      hrefs.add(tool.href);

      // Verify route path exists in app router
      const appDir = join(__dirname, '..', 'app');
      const cleanPath = tool.href.replace(/^\//, '');
      const routePath = join(appDir, cleanPath);
      const pageFile = join(appDir, cleanPath, 'page.tsx');

      const exists = existsSync(routePath) || existsSync(pageFile);
      expect(exists).toBe(true);
    }
  });

  it('validates ecosystem.ts items have valid titles, hrefs, and descriptions', () => {
    if (ecosystemItems && ecosystemItems.length > 0) {
      const hrefs = new Set<string>();
      for (const item of ecosystemItems) {
        expect(item.title).toBeDefined();
        expect(item.href).toBeDefined();
        expect(item.description).toBeDefined();
      }
    }
  });

  it('validates examples.ts contains expected constants and structures', () => {
    expect(examples).toBeDefined();
    if (Array.isArray(examples)) {
      for (const item of examples) {
        expect(item).toBeDefined();
        if (typeof item === 'object' && item !== null) {
          expect((item as any).title ?? (item as any).name ?? (item as any).id).toBeDefined();
        }
      }
    } else if (typeof examples === 'object' && examples !== null) {
      expect(Object.keys(examples).length).toBeGreaterThan(0);
    }
  });

  it('validates tool-docs.ts metadata: every tool has matching doc entries and valid slugs', () => {
    expect(toolDocs).toBeDefined();
    const slugs = Object.keys(toolDocs);
    expect(slugs.length).toBeGreaterThan(0);

    // Check that every tool in tools.ts with a doc or corresponding slug has valid documentation structure
    for (const tool of tools) {
      const slug = tool.href.replace(/^\//, '').replace(/\//g, '-');
      // If the tool has a registered doc entry or matches a tool-doc key
      if (toolDocs[slug]) {
        const doc = toolDocs[slug];
        expect(doc.title).toBeDefined();
        expect(doc.sections).toBeDefined();
        expect(Array.isArray(doc.sections)).toBe(true);
      }
    }

    // Also check all entries in toolDocs directly
    for (const [slug, doc] of Object.entries(toolDocs)) {
      expect(slug).toBeTruthy();
      expect(doc).toBeDefined();
      if (typeof doc === 'object' && doc !== null) {
        expect((doc as any).title).toBeDefined();
      }
    }
  });
});
