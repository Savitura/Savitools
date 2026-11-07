import { parseTrustProxy } from './trust-proxy';

describe('parseTrustProxy', () => {
  it('defaults to false when unset or empty', () => {
    expect(parseTrustProxy(undefined)).toBe(false);
    expect(parseTrustProxy('')).toBe(false);
    expect(parseTrustProxy('   ')).toBe(false);
    expect(parseTrustProxy('false')).toBe(false);
  });

  it('accepts boolean true', () => {
    expect(parseTrustProxy('true')).toBe(true);
    expect(parseTrustProxy('TRUE')).toBe(true);
  });

  it('parses hop counts as numbers', () => {
    expect(parseTrustProxy('1')).toBe(1);
    expect(parseTrustProxy('2')).toBe(2);
  });

  it('parses a single IP or CIDR as a string', () => {
    expect(parseTrustProxy('10.0.0.1')).toBe('10.0.0.1');
    expect(parseTrustProxy('10.0.0.0/8')).toBe('10.0.0.0/8');
  });

  it('parses a comma-separated CIDR list as an array', () => {
    expect(parseTrustProxy('10.0.0.0/8, 192.168.0.0/16')).toEqual([
      '10.0.0.0/8',
      '192.168.0.0/16',
    ]);
  });
});
