/**
 * Fails when an export of a top-level `components/tools/*.tsx` file is not
 * imported by any production source file under `src/` (#261).
 *
 * `other-tools.tsx` shipped two components nobody rendered, both telling users
 * the feature was "implementation in progress" while the real pages were live.
 * A dead tool stub is invisible in review, so this check makes it fail CI.
 *
 * Scope is deliberately the issue's glob: top-level `components/tools/*.tsx`.
 * Test files do not count as usage, so a test cannot keep a dead export alive.
 * Parsing uses the TypeScript compiler, so type-only exports, aliases,
 * namespace and dynamic imports, and re-exports are all read correctly.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';

const SRC = path.resolve(__dirname, '..');
const TOOLS = path.join(SRC, 'components', 'tools');

/** Which exports of one target module a file uses: all of them, or these names. */
type Use = { all: boolean; names: Set<string> };
type Uses = Map<string, Use>;

function parse(fileName: string, text: string): ts.SourceFile {
  return ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}

function hasModifier(node: ts.Node, kind: ts.SyntaxKind): boolean {
  return ts.canHaveModifiers(node) && (ts.getModifiers(node) ?? []).some((m) => m.kind === kind);
}

/** Every name a module exports, including types and re-exports. */
export function exportedNames(sf: ts.SourceFile): string[] {
  const names = new Set<string>();
  for (const st of sf.statements) {
    if (ts.isExportAssignment(st)) {
      names.add('default');
    } else if (ts.isExportDeclaration(st)) {
      if (st.exportClause && ts.isNamedExports(st.exportClause)) {
        for (const el of st.exportClause.elements) names.add(el.name.text);
      }
    } else if (hasModifier(st, ts.SyntaxKind.ExportKeyword)) {
      if (hasModifier(st, ts.SyntaxKind.DefaultKeyword)) {
        names.add('default');
      } else if (ts.isVariableStatement(st)) {
        for (const d of st.declarationList.declarations) {
          if (ts.isIdentifier(d.name)) names.add(d.name.text);
        }
      } else if (
        (ts.isFunctionDeclaration(st) || ts.isClassDeclaration(st) || ts.isInterfaceDeclaration(st) ||
          ts.isTypeAliasDeclaration(st) || ts.isEnumDeclaration(st)) && st.name
      ) {
        names.add(st.name.text);
      }
    }
  }
  return [...names];
}

function resolveSpecifier(specifier: string, fromFile: string): string | null {
  let target: string;
  if (specifier.startsWith('@/')) target = path.join(SRC, specifier.slice(2));
  else if (specifier.startsWith('.')) target = path.resolve(path.dirname(fromFile), specifier);
  else return null;
  return target.replace(/\.(tsx?|jsx?)$/, '');
}

/** What each module this file imports or re-exports from is used for. */
export function usesOf(sf: ts.SourceFile, resolve = resolveSpecifier): Uses {
  const uses: Uses = new Map();
  const recordFor = (spec: ts.Expression) => {
    if (!ts.isStringLiteralLike(spec)) return null;
    const target = resolve(spec.text, sf.fileName);
    if (!target) return null;
    let u = uses.get(target);
    if (!u) uses.set(target, (u = { all: false, names: new Set() }));
    return u;
  };
  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node)) {
      const u = recordFor(node.moduleSpecifier);
      const clause = node.importClause;
      if (u && clause) {
        if (clause.name) u.names.add('default');
        const nb = clause.namedBindings;
        if (nb && ts.isNamespaceImport(nb)) u.all = true;
        if (nb && ts.isNamedImports(nb)) {
          for (const el of nb.elements) u.names.add((el.propertyName ?? el.name).text);
        }
      }
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier) {
      const u = recordFor(node.moduleSpecifier);
      if (u) {
        if (!node.exportClause || ts.isNamespaceExport(node.exportClause)) u.all = true;
        else for (const el of node.exportClause.elements) u.names.add((el.propertyName ?? el.name).text);
      }
    } else if (
      ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && node.arguments[0]
    ) {
      const u = recordFor(node.arguments[0]);
      if (u) u.all = true; // import('...') can reach any export
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return uses;
}

function productionFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : productionFiles(full);
    return /\.(ts|tsx)$/.test(entry.name) && !/\.(test|spec)\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

function unusedExports(toolFiles: string[], sources: Map<string, ts.SourceFile>): string[] {
  const usesByFile = new Map([...sources].map(([file, sf]) => [file, usesOf(sf)] as const));
  return toolFiles.flatMap((file) => {
    const key = file.replace(/\.tsx$/, '');
    const used: Use = { all: false, names: new Set() };
    for (const [importer, uses] of usesByFile) {
      if (importer === file) continue;
      const u = uses.get(key);
      if (u) {
        used.all ||= u.all;
        u.names.forEach((n) => used.names.add(n));
      }
    }
    const sf = sources.get(file) ?? parse(file, fs.readFileSync(file, 'utf8'));
    return exportedNames(sf)
      .filter((name) => !used.all && !used.names.has(name))
      .map((name) => `${path.relative(SRC, file).split(path.sep).join('/')}: ${name}`);
  });
}

describe('components/tools exports', () => {
  it('every export of a components/tools/*.tsx file is imported by production code', () => {
    const sources = new Map(
      productionFiles(SRC).map((file) => [file, parse(file, fs.readFileSync(file, 'utf8'))] as const),
    );
    const toolFiles = fs
      .readdirSync(TOOLS)
      .filter((name) => name.endsWith('.tsx'))
      .map((name) => path.join(TOOLS, name));

    expect(unusedExports(toolFiles, sources)).toEqual([]);
  });

  describe('the check itself', () => {
    const at = (rel: string) => path.join(SRC, rel);
    const tool = at('components/tools/t.tsx');
    const run = (toolText: string, importers: Record<string, string>) =>
      unusedExports(
        [tool],
        new Map([
          [tool, parse(tool, toolText)],
          ...Object.entries(importers).map(([rel, text]) => [at(rel), parse(at(rel), text)] as const),
        ]),
      ).map((line) => line.split(': ')[1]);

    it('reads type-only exports, enums and export lists', () => {
      const sf = parse(tool, `export interface I {}\nexport type T = 1;\nexport enum E { A }\nconst a = 1;\nexport { a as b, type T as U };\nexport default 1;`);
      expect(exportedNames(sf).sort()).toEqual(['E', 'I', 'T', 'U', 'b', 'default']);
    });

    it('flags an export nothing imports, and not one that is imported', () => {
      expect(run('export function Used() {}\nexport const Dead = 1;', {
        'app/page.tsx': `import {\n  Used,\n} from '@/components/tools/t';`,
      })).toEqual(['Dead']);
    });

    it('counts the imported name, not the local alias', () => {
      expect(run('export const Existing = 1;\nexport const Dead = 2;', {
        'app/page.tsx': "import { Existing as Dead } from '@/components/tools/t';",
      })).toEqual(['Dead']);
    });

    it('treats namespace imports, export * and dynamic imports as using everything', () => {
      const text = 'export const A = 1;\nexport const B = 2;';
      expect(run(text, { 'app/a.tsx': "import * as T from '@/components/tools/t';" })).toEqual([]);
      expect(run(text, { 'app/b.ts': "export * from '../components/tools/t';" })).toEqual([]);
      expect(run(text, { 'app/c.tsx': "const T = import('@/components/tools/t');" })).toEqual([]);
    });

    it('counts a default import only for the default export', () => {
      expect(run('export default function X() {}\nexport const Y = 1;', {
        'app/page.tsx': "import X from '@/components/tools/t';",
      })).toEqual(['Y']);
    });

    it('counts re-exports from another module and type-only imports as usage', () => {
      expect(run('export const A = 1;\nexport interface B {}', {
        'components/index.ts': "export { A } from './tools/t';",
        'app/page.tsx': "import type { B } from '@/components/tools/t';",
      })).toEqual([]);
    });

    it('ignores the tool file importing itself and text inside comments or strings', () => {
      expect(run("export const A = 1;\n// import { A } from '@/components/tools/t';\nconst s = \"import { A } from '@/components/tools/t'\";", {
        'app/page.tsx': "// import { A } from '@/components/tools/t';",
      })).toEqual(['A']);
    });
  });
});
