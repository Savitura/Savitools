import {
  MIN_SUPPORTED_NETWORK_PROFILE_VERSION,
  NETWORK_PROFILE_SCHEMA_VERSION,
  NetworkProfileFormatError,
  migrateNetworkProfile,
  parseNetworkProfile,
  parseNetworkProfileStore,
  serializeNetworkProfile,
  serializeNetworkProfileStore,
} from '@/lib/network-profile-format';

const PROFILE = {
  name: 'Local',
  horizonUrl: 'https://horizon-testnet.stellar.org/',
  networkPassphrase: 'Test SDF Network ; September 2015',
  friendbotUrl: 'https://friendbot.stellar.org',
};

describe('network profile format', () => {
  it('exports the current schema version and omits instance metadata', () => {
    const json = serializeNetworkProfile({ ...PROFILE, id: 'profile-1', isDefault: true });
    const parsed = JSON.parse(json);

    expect(parsed.schemaVersion).toBe(NETWORK_PROFILE_SCHEMA_VERSION);
    expect(parsed.horizonUrl).toBe('https://horizon-testnet.stellar.org');
    expect(parsed.id).toBeUndefined();
    expect(parsed.isDefault).toBeUndefined();
  });

  it('imports a legacy unversioned profile with sensible defaults', () => {
    const migrated = migrateNetworkProfile({
      horizonUrl: 'https://horizon.stellar.org/',
      networkPassphrase: 'Public Global Stellar Network ; September 2015',
    });

    expect(migrated.schemaVersion).toBe(NETWORK_PROFILE_SCHEMA_VERSION);
    expect(migrated.name).toBe('Imported Profile');
    expect(migrated.horizonUrl).toBe('https://horizon.stellar.org');
    expect(migrated.friendbotUrl).toBeUndefined();
  });

  it('round-trips the current versioned payload', () => {
    const parsed = parseNetworkProfile(serializeNetworkProfile(PROFILE));

    expect(parsed).toMatchObject({
      schemaVersion: NETWORK_PROFILE_SCHEMA_VERSION,
      name: PROFILE.name,
      horizonUrl: 'https://horizon-testnet.stellar.org',
      networkPassphrase: PROFILE.networkPassphrase,
      friendbotUrl: PROFILE.friendbotUrl,
    });
  });

  it.each([NETWORK_PROFILE_SCHEMA_VERSION + 1, MIN_SUPPORTED_NETWORK_PROFILE_VERSION - 1])(
    'rejects unsupported schema version %s with an actionable message',
    (schemaVersion) => {
      expect(() => migrateNetworkProfile({ ...PROFILE, schemaVersion })).toThrow(
        NetworkProfileFormatError,
      );
      expect(() => migrateNetworkProfile({ ...PROFILE, schemaVersion })).toThrow(
        new RegExp(`version ${schemaVersion} is not supported`),
      );
    },
  );

  it('rejects a non-integer version', () => {
    expect(() => migrateNetworkProfile({ ...PROFILE, schemaVersion: '1' })).toThrow(
      /schemaVersion must be an integer/,
    );
    expect(() => migrateNetworkProfile({ ...PROFILE, schemaVersion: 1.5 })).toThrow(
      /schemaVersion must be an integer/,
    );
  });

  it('rejects malformed payloads before returning partial state', () => {
    expect(() => parseNetworkProfile('{not json')).toThrow(/Invalid network profile JSON/);
    expect(() => migrateNetworkProfile(null)).toThrow(/must be an object/);
    expect(() => migrateNetworkProfile({ name: 'No URL', networkPassphrase: 'x' })).toThrow(
      /horizonUrl/,
    );
    expect(() => migrateNetworkProfile({ horizonUrl: 'https://horizon.stellar.org' })).toThrow(
      /networkPassphrase/,
    );
  });

  it('migrates the legacy localStorage array and the versioned envelope', () => {
    const fromArray = parseNetworkProfileStore(
      JSON.stringify([{ ...PROFILE, id: 'p1', isDefault: true }]),
    );
    const fromEnvelope = parseNetworkProfileStore(
      serializeNetworkProfileStore([{ ...PROFILE, id: 'p1' }]),
    );

    expect(fromArray[0]).toMatchObject({ id: 'p1', isDefault: true });
    expect(fromEnvelope[0]).toMatchObject({ id: 'p1', isDefault: false });
    expect(JSON.parse(serializeNetworkProfileStore(fromArray)).schemaVersion).toBe(
      NETWORK_PROFILE_SCHEMA_VERSION,
    );
  });

  it('rejects a malformed or unknown-version store', () => {
    expect(() => parseNetworkProfileStore('{bad')).toThrow(/Invalid stored network profiles/);
    expect(() => parseNetworkProfileStore(JSON.stringify({ profiles: [] }))).toThrow(
      /schemaVersion/,
    );
    expect(() =>
      parseNetworkProfileStore(JSON.stringify({ schemaVersion: 99, profiles: [] })),
    ).toThrow(/version 99 is not supported/);
  });
});
