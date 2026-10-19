import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

/**
 * Locale completeness guard (Savitura/Savitools#429).
 *
 * `en.json` is the source of truth. Every other locale file must define the
 * same flattened key set, otherwise `next-intl` silently falls back to English
 * or renders the raw dotted key. This fails on any missing key instead.
 */
const MESSAGES_DIR = join(__dirname, '..', '..', 'messages');
const DEFAULT_LOCALE = 'en';

function flatten(
  value: unknown,
  prefix = '',
  into: Map<string, unknown> = new Map(),
): Map<string, unknown> {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      flatten(child, prefix ? `${prefix}.${key}` : key, into);
    }
  } else {
    into.set(prefix, value);
  }
  return into;
}

function readMessages(locale: string): Map<string, unknown> {
  const raw = readFileSync(join(MESSAGES_DIR, `${locale}.json`), 'utf8');
  return flatten(JSON.parse(raw));
}

describe('locale message files', () => {
  const enMessages = readMessages(DEFAULT_LOCALE);
  const enKeys = [...enMessages.keys()];

  const locales = readdirSync(MESSAGES_DIR)
    .filter((file) => file.endsWith('.json') && file !== `${DEFAULT_LOCALE}.json`)
    .map((file) => file.replace(/\.json$/, ''));

  it('ships at least one non-default locale', () => {
    expect(locales.length).toBeGreaterThan(0);
  });

  it.each(locales)('%s defines every key from en.json', (locale) => {
    const localeMessages = readMessages(locale);
    const missing = enKeys.filter((key) => !localeMessages.has(key));

    expect(missing).toEqual([]);
  });
});
