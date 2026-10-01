import { isAllowedWebOrigin, parseWebOrigins, primaryWebOrigin } from './web-origins';

describe('web-origins', () => {
  describe('parseWebOrigins', () => {
    it('returns the default origin when raw is undefined or empty', () => {
      expect(parseWebOrigins(undefined)).toEqual(['http://localhost:3000']);
      expect(parseWebOrigins('')).toEqual(['http://localhost:3000']);
      expect(parseWebOrigins('   ')).toEqual(['http://localhost:3000']);
    });

    it('parses a single origin and removes trailing slashes', () => {
      expect(parseWebOrigins('https://app.savitools.dev/')).toEqual([
        'https://app.savitools.dev',
      ]);
    });

    it('parses comma-separated origins with whitespace trimming', () => {
      expect(
        parseWebOrigins(
          'https://app.savitools.dev, https://staging.savitools.dev/ , http://localhost:3000',
        ),
      ).toEqual([
        'https://app.savitools.dev',
        'https://staging.savitools.dev',
        'http://localhost:3000',
      ]);
    });
  });

  describe('isAllowedWebOrigin', () => {
    const allowed = ['https://app.savitools.dev', 'http://localhost:3000'];

    it('allows same-origin / non-browser requests with no Origin header', () => {
      expect(isAllowedWebOrigin(undefined, allowed)).toBe(true);
      expect(isAllowedWebOrigin('', allowed)).toBe(true);
    });

    it('allows matched origins, normalizing trailing slashes', () => {
      expect(isAllowedWebOrigin('https://app.savitools.dev', allowed)).toBe(true);
      expect(isAllowedWebOrigin('https://app.savitools.dev/', allowed)).toBe(true);
      expect(isAllowedWebOrigin('http://localhost:3000', allowed)).toBe(true);
    });

    it('rejects origins not in the allowed list', () => {
      expect(isAllowedWebOrigin('https://evil.com', allowed)).toBe(false);
      expect(isAllowedWebOrigin('https://sub.app.savitools.dev', allowed)).toBe(
        false,
      );
    });
  });

  describe('primaryWebOrigin', () => {
    it('returns the first origin in the parsed list', () => {
      const origins = parseWebOrigins(
        'https://primary.com, https://secondary.com',
      );
      expect(primaryWebOrigin(origins)).toBe('https://primary.com');
    });

    it('falls back to localhost default when empty array is passed', () => {
      expect(primaryWebOrigin([])).toBe('http://localhost:3000');
    });
  });
});
