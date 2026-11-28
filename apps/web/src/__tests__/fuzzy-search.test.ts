import { calculateFuzzyScore, fuzzyFilter, fuzzyScore } from '@/lib/fuzzy-search';

describe('calculateFuzzyScore', () => {
  it('treats empty or whitespace-only queries as neutral matches', () => {
    expect(calculateFuzzyScore('Transaction Inspector', '')).toBe(1);
    expect(calculateFuzzyScore('Transaction Inspector', '   ')).toBe(1);
    expect(fuzzyScore('', '   ')).toBe(1);
  });

  it('returns 0 for an empty target or a non-matching query', () => {
    expect(calculateFuzzyScore('', 'inspector')).toBe(0);
    expect(calculateFuzzyScore('Transaction Inspector', 'xyz123')).toBe(0);
    expect(calculateFuzzyScore('stellar', 'slq')).toBe(0);
  });

  it('ranks exact, prefix, word-boundary substring, acronym, and partial substring matches', () => {
    const exact = calculateFuzzyScore('Inspector', 'inspector');
    const prefix = calculateFuzzyScore('Transaction Inspector', 'trans');
    const boundary = calculateFuzzyScore('Contract Events', 'Events');
    const acronym = calculateFuzzyScore('Contract Events', 'ce');
    const substring = calculateFuzzyScore('ContractEvents', 'Events');

    expect(exact).toBe(1000);
    expect(prefix).toBeGreaterThan(boundary);
    expect(boundary).toBeGreaterThan(acronym);
    expect(acronym).toBeGreaterThan(substring);
    expect(substring).toBeGreaterThan(0);
  });

  it('matches case-insensitively and trims query whitespace', () => {
    expect(calculateFuzzyScore('SOROBAN Studio', ' soroban ')).toBe(
      calculateFuzzyScore('SOROBAN Studio', 'soroban'),
    );
  });

  it('awards sequential character matches with consecutive bonuses', () => {
    const sequential = calculateFuzzyScore('stellar', 'sl');
    expect(sequential).toBeGreaterThan(0);
    expect(sequential).toBeLessThan(calculateFuzzyScore('stellar', 'st'));
  });

  it('handles special-character queries as literal input', () => {
    expect(calculateFuzzyScore('a.b/c_d-e', '.')).toBeGreaterThan(0);
    expect(calculateFuzzyScore('a.b/c_d-e', '[')).toBe(0);
    expect(calculateFuzzyScore('a.b/c_d-e', '.*')).toBe(0);
    expect(() => calculateFuzzyScore('a.b/c_d-e', '(?:')).not.toThrow();
  });
});

describe('fuzzyFilter', () => {
  const items = ['Transaction Inspector', 'Contract Events', 'SDK Generator', 'Network Status'];

  it('returns the original list for empty queries', () => {
    expect(fuzzyFilter(items, '', (item) => item)).toBe(items);
    expect(fuzzyFilter(items, '  ', (item) => [item])).toBe(items);
  });

  it('filters and ranks by the best-scoring text field', () => {
    const result = fuzzyFilter(items, 'ce', (item) => item);
    expect(result[0]).toBe('Contract Events');
    expect(result).not.toContain('SDK Generator');
  });

  it('supports multiple fields with per-field weights', () => {
    const catalog = [
      { title: 'Payment', description: 'Send XLM to a Stellar account' },
      { title: 'Contract Events', description: 'Inspect emitted events' },
    ];

    const unweighted = fuzzyFilter(catalog, 'events', (item) => [item.title, item.description]);
    expect(unweighted[0].title).toBe('Contract Events');

    const weighted = fuzzyFilter(catalog, 'events', {
      getTexts: (item) => [item.title, item.description],
      getWeight: (_item, index) => (index === 0 ? 10 : 1),
    });
    expect(weighted[0].title).toBe('Contract Events');
  });

  it('ignores empty text fields and matches special characters literally', () => {
    expect(fuzzyFilter(['', 'a.b', 'abc'], '.', (item) => item)).toEqual(['a.b']);
  });
});
