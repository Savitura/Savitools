import { spawnSync } from 'child_process';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

/**
 * Locale completeness guard (Savitura/Savitools#429).
 *
 * `en.json` is the source of truth. Every other locale file must define the
 * same flattened key set, otherwise `next-intl` silently falls back to English
 * or renders the raw dotted key. This fails on any missing key instead.
 *
 * This guard also validates ICU message structure (interpolation variables,
 * argument types, offsets, and plural/select branches), because equal key sets
 * can still render broken messages when their structure differs
 * (Savitura/Savitools#463).
 */
const { validateCatalog } = require('../../scripts/lib/message-structure');

type MessageIssue = {
  kind: 'key' | 'structure';
  key: string;
  reason: string;
};

const MESSAGES_DIR = join(__dirname, '..', '..', 'messages');
const FIXTURES_DIR = join(__dirname, '..', '..', 'scripts', '__fixtures__', 'translations');
const DEFAULT_LOCALE = 'en';

function readCatalog(locale: string, directory = MESSAGES_DIR): unknown {
  const raw = readFileSync(join(directory, `${locale}.json`), 'utf8');
  return JSON.parse(raw);
}

describe('locale message files', () => {
  const enCatalog = readCatalog(DEFAULT_LOCALE);

  const locales = readdirSync(MESSAGES_DIR)
    .filter((file) => file.endsWith('.json') && file !== `${DEFAULT_LOCALE}.json`)
    .map((file) => file.replace(/\.json$/, ''));

  it('ships at least one non-default locale', () => {
    expect(locales.length).toBeGreaterThan(0);
  });

  it.each(locales)('%s defines every key from en.json', (locale) => {
    const issues = validateCatalog(enCatalog, readCatalog(locale));
    const keyIssues = issues.filter((issue: MessageIssue) => issue.kind === 'key');

    expect(keyIssues).toEqual([]);
  });

  it.each(locales)('%s has identical ICU structure for all keys', (locale) => {
    const issues = validateCatalog(enCatalog, readCatalog(locale));
    const structureIssues = issues.filter((issue: MessageIssue) => issue.kind === 'structure');

    expect(structureIssues).toEqual([]);
  });
});

describe('message structure fixtures', () => {
  it('passes when interpolation variables and plural/select branches match', () => {
    const issues = validateCatalog(
      readCatalog('en', join(FIXTURES_DIR, 'passing')),
      readCatalog('es', join(FIXTURES_DIR, 'passing')),
    );

    expect(issues).toEqual([]);
  });

  it('reports missing and extra interpolation variables', () => {
    const issues = validateCatalog(
      readCatalog('en', join(FIXTURES_DIR, 'failing')),
      readCatalog('es', join(FIXTURES_DIR, 'failing')),
    );

    expect(issues).toEqual(
      expect.arrayContaining([
        {
          kind: 'structure',
          key: 'greeting',
          reason: 'missing interpolation variable "{name}"',
        },
        {
          kind: 'structure',
          key: 'greeting',
          reason: 'extra interpolation variable "{nombre}"',
        },
      ]),
    );
  });

  it('reports missing and extra plural/select branches', () => {
    const issues = validateCatalog(
      readCatalog('en', join(FIXTURES_DIR, 'failing')),
      readCatalog('es', join(FIXTURES_DIR, 'failing')),
    );

    expect(issues).toEqual(
      expect.arrayContaining([
        {
          kind: 'structure',
          key: 'items',
          reason: 'missing plural branch "other" for "{count}"',
        },
        {
          kind: 'structure',
          key: 'selection',
          reason: 'extra select branch "video" for "{kind}"',
        },
      ]),
    );
  });

  it('reports nested variables inside a branch', () => {
    const issues = validateCatalog(
      readCatalog('en', join(FIXTURES_DIR, 'failing')),
      readCatalog('es', join(FIXTURES_DIR, 'failing')),
    );

    expect(issues).toEqual(
      expect.arrayContaining([
        {
          kind: 'structure',
          key: 'nested',
          reason: 'missing interpolation variable "{name}" (inside count.one)',
        },
      ]),
    );
  });

  it('prints the locale, key, and reason when check-translations fails', () => {
    const result = spawnSync(
      process.execPath,
      [join(__dirname, '..', '..', 'scripts', 'check-translations.js')],
      {
        encoding: 'utf8',
        env: {
          ...process.env,
          TRANSLATIONS_DIR: join(FIXTURES_DIR, 'failing'),
        },
      },
    );

    expect(result.status).toBe(1);
    expect(result.stdout).toContain('❌ es: Found');
    expect(result.stdout).toContain('greeting: missing interpolation variable "{name}"');
  });
});
