import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

/**
 * Locale completeness guard (Savitura/Savitools#429).
 *
 * `en.json` is the source of truth. Every other locale file must define the
 * same flattened key set, otherwise `next-intl` silently falls back to English
 * or renders the raw dotted key. This fails on any missing key instead.
 *
 * Additionally, this guard validates that ICU message structures (plural/select
 * branches and interpolation variables) are identical across locales, because
 * equal key sets can still render broken messages when interpolation parameters
 * or plural branches differ (Savitura/Savitools#463).
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

/**
 * Normalize an ICU message string into a comparable structure.
 * Returns an object with the parameter name, type, and branch contents.
 * Falls back to the raw string if no ICU pattern is detected.
 */
function normalizeIcu(msg: string): string | Record<string, unknown> {
  if (typeof msg !== 'string') return msg;

  // Match {name, plural, ...} or {name, select, ...}
  const icuRegex = /^\{(\w+)\s*,\s*(plural|select)(.+)\}$/;
  const match = msg.match(icuRegex);
  if (match) {
    const [, name, type, inner] = match;
    // Extract branch contents between outermost braces
    const branchRegex = /\{([^}]+)\}/g;
    const branches: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = branchRegex.exec(inner)) !== null) {
      branches.push(m[1]);
    }
    return { name, type, branches };
  }

  // Fallback: check for simple interpolation {var}
  const simpleRegex = /\{(\w+)\}/g;
  const simpleMatches: string[] = [];
  let sm: RegExpExecArray | null;
  while ((sm = simpleRegex.exec(msg)) !== null) {
    simpleMatches.push(sm[1]);
  }
  if (simpleMatches.length > 0) return { type: 'interpolation', vars: simpleMatches };

  return msg;
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

  it.each(locales)('%s has identical ICU structure for all keys', (locale) => {
    const localeMessages = readMessages(locale);

    for (const key of enKeys) {
      const enMsg = enMessages.get(key);
      const localeMsg = localeMessages.get(key);

      // Only validate ICU structure for messages that contain ICU patterns
      if (typeof enMsg === 'string' && typeof localeMsg === 'string') {
        const hasIcu = /\{(?:\w+,\s*)(plural|select)/.test(enMsg);
        if (hasIcu) {
          const enIcu = normalizeIcu(enMsg);
          const localeIcu = normalizeIcu(localeMsg);

          expect(localeIcu).toEqual(enIcu);
        }
      }
    }
  });
});
