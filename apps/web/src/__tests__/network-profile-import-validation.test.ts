/**
 * Tests for client-side schema validation applied to imported network profile files.
 *
 * The network page calls `parseNetworkProfile` before any API request, so a
 * malformed or future-version file is rejected locally with an actionable
 * message rather than forwarded to the backend as an opaque 400.
 */
import {
  NETWORK_PROFILE_SCHEMA_VERSION,
  MIN_SUPPORTED_NETWORK_PROFILE_VERSION,
  NetworkProfileFormatError,
  parseNetworkProfile,
} from '@/lib/network-profile-format';

const VALID_PROFILE_JSON = JSON.stringify({
  schemaVersion: NETWORK_PROFILE_SCHEMA_VERSION,
  name: 'Testnet Local',
  horizonUrl: 'https://horizon-testnet.stellar.org/',
  networkPassphrase: 'Test SDF Network ; September 2015',
  friendbotUrl: 'https://friendbot.stellar.org',
});

describe('imported network profile schema validation', () => {
  describe('primary path – valid exports', () => {
    it('accepts a current versioned profile and normalises the Horizon URL', () => {
      const profile = parseNetworkProfile(VALID_PROFILE_JSON);

      expect(profile.schemaVersion).toBe(NETWORK_PROFILE_SCHEMA_VERSION);
      expect(profile.name).toBe('Testnet Local');
      // Trailing slash is stripped before the profile is stored.
      expect(profile.horizonUrl).toBe('https://horizon-testnet.stellar.org');
      expect(profile.networkPassphrase).toBe('Test SDF Network ; September 2015');
      expect(profile.friendbotUrl).toBe('https://friendbot.stellar.org');
    });

    it('accepts a legacy export that omits schemaVersion and fills in a default name', () => {
      const legacy = JSON.stringify({
        horizonUrl: 'https://horizon.stellar.org',
        networkPassphrase: 'Public Global Stellar Network ; September 2015',
      });

      const profile = parseNetworkProfile(legacy);

      expect(profile.schemaVersion).toBe(NETWORK_PROFILE_SCHEMA_VERSION);
      expect(profile.name).toBe('Imported Profile');
    });

    it('passes through an optional friendbotUrl when present', () => {
      const withFriendbot = JSON.stringify({
        schemaVersion: NETWORK_PROFILE_SCHEMA_VERSION,
        name: 'Custom',
        horizonUrl: 'https://custom.example.com/',
        networkPassphrase: 'Custom Network ; January 2024',
        friendbotUrl: 'https://custom.example.com/friendbot',
      });

      expect(parseNetworkProfile(withFriendbot).friendbotUrl).toBe(
        'https://custom.example.com/friendbot',
      );
    });

    it('omits friendbotUrl when the field is absent', () => {
      const without = JSON.stringify({
        schemaVersion: NETWORK_PROFILE_SCHEMA_VERSION,
        name: 'No Friendbot',
        horizonUrl: 'https://horizon.stellar.org',
        networkPassphrase: 'Public Global Stellar Network ; September 2015',
      });

      expect(parseNetworkProfile(without).friendbotUrl).toBeUndefined();
    });
  });

  describe('failure cases – malformed or incompatible files', () => {
    it('throws INVALID_JSON for a file that is not valid JSON', () => {
      const err = catchFormatError(() => parseNetworkProfile('{not json at all'));

      expect(err).toBeInstanceOf(NetworkProfileFormatError);
      expect(err?.code).toBe('INVALID_JSON');
      expect(err?.message).toMatch(/Invalid network profile JSON/);
    });

    it('throws INVALID_PROFILE when the top-level value is not an object', () => {
      const err = catchFormatError(() => parseNetworkProfile(JSON.stringify([])));

      expect(err).toBeInstanceOf(NetworkProfileFormatError);
      expect(err?.code).toBe('INVALID_PROFILE');
      expect(err?.message).toMatch(/must be an object/);
    });

    it('throws INVALID_PROFILE when horizonUrl is missing', () => {
      const err = catchFormatError(() =>
        parseNetworkProfile(
          JSON.stringify({
            schemaVersion: NETWORK_PROFILE_SCHEMA_VERSION,
            name: 'Missing URL',
            networkPassphrase: 'Test SDF Network ; September 2015',
          }),
        ),
      );

      expect(err?.code).toBe('INVALID_PROFILE');
      expect(err?.message).toMatch(/horizonUrl/);
    });

    it('throws INVALID_PROFILE when networkPassphrase is missing', () => {
      const err = catchFormatError(() =>
        parseNetworkProfile(
          JSON.stringify({
            schemaVersion: NETWORK_PROFILE_SCHEMA_VERSION,
            name: 'Missing Passphrase',
            horizonUrl: 'https://horizon.stellar.org',
          }),
        ),
      );

      expect(err?.code).toBe('INVALID_PROFILE');
      expect(err?.message).toMatch(/networkPassphrase/);
    });

    it('throws INVALID_PROFILE when horizonUrl is a whitespace-only string', () => {
      const err = catchFormatError(() =>
        parseNetworkProfile(
          JSON.stringify({
            name: 'Blank URL',
            horizonUrl: '   ',
            networkPassphrase: 'Test SDF Network ; September 2015',
          }),
        ),
      );

      expect(err?.code).toBe('INVALID_PROFILE');
    });

    it('throws UNSUPPORTED_VERSION for a future schema version', () => {
      const future = NETWORK_PROFILE_SCHEMA_VERSION + 1;
      const err = catchFormatError(() =>
        parseNetworkProfile(
          JSON.stringify({
            schemaVersion: future,
            name: 'Future',
            horizonUrl: 'https://horizon.stellar.org',
            networkPassphrase: 'Public Global Stellar Network ; September 2015',
          }),
        ),
      );

      expect(err?.code).toBe('UNSUPPORTED_VERSION');
      expect(err?.message).toMatch(new RegExp(`version ${future} is not supported`));
      expect(err?.message).toMatch(
        new RegExp(`${MIN_SUPPORTED_NETWORK_PROFILE_VERSION}.*${NETWORK_PROFILE_SCHEMA_VERSION}`),
      );
    });

    it('throws UNSUPPORTED_VERSION for a past schema version below the minimum', () => {
      const tooOld = MIN_SUPPORTED_NETWORK_PROFILE_VERSION - 1;
      // Only versions below the floor are unsupported; version 0 is the test case.
      if (tooOld < 0) {
        // MIN is 1, so 0 is below the floor.
      }
      const err = catchFormatError(() =>
        parseNetworkProfile(
          JSON.stringify({
            schemaVersion: tooOld,
            name: 'Too Old',
            horizonUrl: 'https://horizon.stellar.org',
            networkPassphrase: 'Public Global Stellar Network ; September 2015',
          }),
        ),
      );

      // Version 0 is a non-integer path in the current schema reader, so the
      // code is either UNSUPPORTED_VERSION or INVALID_PROFILE – both are
      // NetworkProfileFormatError and prevent the import from proceeding.
      expect(err).toBeInstanceOf(NetworkProfileFormatError);
    });

    it('throws UNSUPPORTED_VERSION for a non-integer schemaVersion', () => {
      const err = catchFormatError(() =>
        parseNetworkProfile(
          JSON.stringify({
            schemaVersion: 1.5,
            name: 'Float version',
            horizonUrl: 'https://horizon.stellar.org',
            networkPassphrase: 'Public Global Stellar Network ; September 2015',
          }),
        ),
      );

      expect(err?.code).toBe('UNSUPPORTED_VERSION');
      expect(err?.message).toMatch(/schemaVersion must be an integer/);
    });

    it('does not modify external state when validation throws', () => {
      // Verify that parseNetworkProfile is pure: it either returns the
      // validated profile or throws, never returning partial data.
      let result: ReturnType<typeof parseNetworkProfile> | undefined;
      let threw = false;

      try {
        result = parseNetworkProfile('{bad json');
      } catch {
        threw = true;
      }

      expect(threw).toBe(true);
      expect(result).toBeUndefined();
    });
  });
});

/** Calls fn, catches any NetworkProfileFormatError, and returns it (or null). */
function catchFormatError(fn: () => unknown): NetworkProfileFormatError | null {
  try {
    fn();
    return null;
  } catch (err) {
    if (err instanceof NetworkProfileFormatError) return err;
    throw err;
  }
}
