/* eslint-disable @typescript-eslint/no-var-requires */
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { ALL_ENTITIES, ALL_MIGRATIONS } from './database.registry';
import dataSource from './data-source';

/** Every `.entity.ts` file under `apps/api/src`, recursively. */
function collectEntityFiles(dir: string): string[] {
  const files: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      files.push(...collectEntityFiles(path));
    } else if (path.endsWith('.entity.ts')) {
      files.push(path);
    }
  }
  return files;
}

function exportedClasses(modulePath: string): unknown[] {
  const module = require(modulePath) as Record<string, unknown>;
  return Object.values(module).filter((value) => typeof value === 'function');
}

describe('database registry', () => {
  it('registers every migration file on disk', () => {
    const migrationsDir = join(__dirname, 'migrations');
    const files = readdirSync(migrationsDir).filter(
      (file) => file.endsWith('.ts') && !file.endsWith('.spec.ts'),
    );

    const unregistered = files.filter(
      (file) =>
        !exportedClasses(join(migrationsDir, file)).some((candidate) =>
          (ALL_MIGRATIONS as unknown[]).includes(candidate),
        ),
    );

    expect(unregistered).toEqual([]);
  });

  it('registers every entity file on disk', () => {
    const unregistered = collectEntityFiles(join(__dirname, '..')).filter(
      (file) =>
        !exportedClasses(file).some((candidate) =>
          (ALL_ENTITIES as unknown[]).includes(candidate),
        ),
    );

    expect(unregistered).toEqual([]);
  });

  it('contains no duplicate entities or migrations', () => {
    expect(new Set(ALL_ENTITIES).size).toBe(ALL_ENTITIES.length);
    expect(new Set(ALL_MIGRATIONS).size).toBe(ALL_MIGRATIONS.length);
  });

  it('is the exact list the CLI data source consumes', () => {
    expect(dataSource.options.entities).toEqual(ALL_ENTITIES);
    expect(dataSource.options.migrations).toEqual(ALL_MIGRATIONS);
  });

  it('keeps both entry points on the registry instead of re-declaring the lists', () => {
    // The runtime (app.module.ts) and the CLI (data-source.ts) are the two
    // places a schema can silently diverge from. Both must import the registry
    // rather than carry their own array, which is how the drift started.
    const entryPoints = [
      readFileSync(join(__dirname, '..', 'app.module.ts'), 'utf8'),
      readFileSync(join(__dirname, 'data-source.ts'), 'utf8'),
    ];

    for (const source of entryPoints) {
      expect(source).toMatch(/from ['"]\.{1,2}\/(database\/)?database\.registry['"]/);
      expect(source).toMatch(/ALL_MIGRATIONS/);
      expect(source).toMatch(/ALL_ENTITIES/);
      // No inline `migrations: [ ... ]` / `entities: [ ... ]` literal.
      expect(source).not.toMatch(/migrations:\s*\[/);
      expect(source).not.toMatch(/entities:\s*\[/);
    }
  });
});
