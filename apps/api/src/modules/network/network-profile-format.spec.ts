import { BadRequestException } from '@nestjs/common';
import {
  NETWORK_PROFILE_SCHEMA_VERSION,
  MIN_SUPPORTED_NETWORK_PROFILE_VERSION,
  migrateNetworkProfilePayload,
} from './network-profile-format';

describe('migrateNetworkProfilePayload', () => {
  it('accepts a valid profile payload with current version and normalizes trailing slashes on horizonUrl', () => {
    const profile = migrateNetworkProfilePayload({
      schemaVersion: NETWORK_PROFILE_SCHEMA_VERSION,
      name: 'Test Profile',
      horizonUrl: 'https://horizon-testnet.stellar.org/',
      networkPassphrase: 'Test SDF Network ; September 2015',
      friendbotUrl: 'https://friendbot.stellar.org/',
      isDefault: true,
    });

    expect(profile.name).toBe('Test Profile');
    expect(profile.horizonUrl).toBe('https://horizon-testnet.stellar.org');
    expect(profile.networkPassphrase).toBe('Test SDF Network ; September 2015');
    expect(profile.friendbotUrl).toBe('https://friendbot.stellar.org/');
    expect(profile.isDefault).toBe(true);
  });

  it('treats missing schemaVersion as version 1 and provides default name', () => {
    const profile = migrateNetworkProfilePayload({
      horizonUrl: 'https://horizon.stellar.org',
      networkPassphrase: 'Public Global Stellar Network ; September 2015',
    });

    expect(profile.name).toBe('Imported Profile');
    expect(profile.horizonUrl).toBe('https://horizon.stellar.org');
    expect(profile.networkPassphrase).toBe('Public Global Stellar Network ; September 2015');
    expect(profile.friendbotUrl).toBeUndefined();
    expect(profile.isDefault).toBeUndefined();
  });

  it('rejects non-integer schemaVersion with BadRequestException', () => {
    expect(() =>
      migrateNetworkProfilePayload({
        schemaVersion: 1.5,
        horizonUrl: 'https://horizon.stellar.org',
        networkPassphrase: 'Public Global Stellar Network ; September 2015',
      }),
    ).toThrow(BadRequestException);
  });

  it('rejects schemaVersion below minimum supported version with BadRequestException', () => {
    expect(() =>
      migrateNetworkProfilePayload({
        schemaVersion: MIN_SUPPORTED_NETWORK_PROFILE_VERSION - 1,
        horizonUrl: 'https://horizon.stellar.org',
        networkPassphrase: 'Public Global Stellar Network ; September 2015',
      }),
    ).toThrow(BadRequestException);
  });

  it('rejects schemaVersion above current version with BadRequestException', () => {
    expect(() =>
      migrateNetworkProfilePayload({
        schemaVersion: NETWORK_PROFILE_SCHEMA_VERSION + 1,
        horizonUrl: 'https://horizon.stellar.org',
        networkPassphrase: 'Public Global Stellar Network ; September 2015',
      }),
    ).toThrow(BadRequestException);
  });

  it('rejects missing or empty horizonUrl', () => {
    expect(() =>
      migrateNetworkProfilePayload({
        schemaVersion: NETWORK_PROFILE_SCHEMA_VERSION,
        networkPassphrase: 'Test SDF Network ; September 2015',
      }),
    ).toThrow(BadRequestException);

    expect(() =>
      migrateNetworkProfilePayload({
        schemaVersion: NETWORK_PROFILE_SCHEMA_VERSION,
        horizonUrl: '   ',
        networkPassphrase: 'Test SDF Network ; September 2015',
      }),
    ).toThrow(BadRequestException);
  });

  it('rejects missing or empty networkPassphrase', () => {
    expect(() =>
      migrateNetworkProfilePayload({
        schemaVersion: NETWORK_PROFILE_SCHEMA_VERSION,
        horizonUrl: 'https://horizon.stellar.org',
      }),
    ).toThrow(BadRequestException);

    expect(() =>
      migrateNetworkProfilePayload({
        schemaVersion: NETWORK_PROFILE_SCHEMA_VERSION,
        horizonUrl: 'https://horizon.stellar.org',
        networkPassphrase: '   ',
      }),
    ).toThrow(BadRequestException);
  });
});
