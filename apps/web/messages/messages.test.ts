import { describe, it, expect } from 'vitest';
import en from './en.json';
import es from './es.json';

function getKeys(obj: any, prefix = ''): string[] {
  let keys: string[] = [];
  for (const k of Object.keys(obj)) {
    const fullKey = prefix ? `${prefix}.${k}` : k;
    if (obj[k] && typeof obj[k] === 'object' && !Array.isArray(obj[k])) {
      keys = keys.concat(getKeys(obj[k], fullKey));
    } else {
      keys.push(fullKey);
    }
  }
  return keys;
}

function extractPlaceholders(str: string): string[] {
  const matches = str.match(/\{[^}]+\}/g);
  return matches ? matches.sort() : [];
}

describe('Locale messages parity', () => {
  const enKeys = getKeys(en);
  const esKeys = getKeys(es);

  it('should have the exact same set of keys in en.json and es.json', () => {
    const missingInEs = enKeys.filter(k => !esKeys.includes(k));
    const missingInEn = esKeys.filter(k => !enKeys.includes(k));

    expect({ missingInEs, missingInEn }).toEqual({
      missingInEs: [],
      missingInEn: [],
    });
  });

  it('should have matching interpolation placeholders for each key', () => {
    const mismatches: string[] = [];
    for (const key of enKeys) {
      const getNested = (o: any, path: string) => path.split('.').reduce((acc, part) => acc && acc[part], o);
      const enVal = getNested(en, key);
      const esVal = getNested(es, key);

      if (typeof enVal === 'string' && typeof esVal === 'string') {
        const enPlaceholders = extractPlaceholders(enVal);
        const esPlaceholders = extractPlaceholders(esVal);
        if (JSON.stringify(enPlaceholders) !== JSON.stringify(esPlaceholders)) {
          mismatches.push(`${key}: en has ${JSON.stringify(enPlaceholders)}, es has ${JSON.stringify(esPlaceholders)}`);
        }
      }
    }

    expect(mismatches).toEqual([]);
  });
});
