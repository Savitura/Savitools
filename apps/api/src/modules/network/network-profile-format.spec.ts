import { BadRequestException } from '@nestjs/common';
import { migrateNetworkProfilePayload, NETWORK_PROFILE_SCHEMA_VERSION, MIN_SUPPORTED_NETWORK_PROFILE_VERSION, ImportedNetworkProfile } from './network-profile-format';

const defaultValidInput = {
  schemaVersion: 1,
  name: 'testnet',
  horizonUrl: 'https://horizon-testnet.stellar.org',
  networkPassphrase: 'Test SDF Network ; September 2015',
};

describe('migrateNetworkProfilePayload', () => {
  it('migrates a valid payload with all fields', () => {
    const result = migrateNetworkProfilePayload(defaultValidInput);
    expect(result).toEqual({
      name: 'testnet',
      horizonUrl: 'https://horizon-testnet.stellar.org',
      networkPassphrase: 'Test SDF Network ; September 2015',
    } as ImportedNetworkProfile);
  });

  it('defaults schemaVersion to MIN_SUPPORTED when omitted', () => {
    const result = migrateNetworkProfilePayload({
      horizonUrl: 'https://horizon-testnet.stellar.org',
      networkPassphrase: 'Test SDF Network ; September 2015',
    });
    expect(result.schemaVersion).toBeUndefined();
    expect(result.name).toBe('Imported Profile');
  });

  it('rejects schemaVersion below MIN_SUPPORTED', () => {
    expect(() =>
      migrateNetworkProfilePayload({
        ...defaultValidInput,
        schemaVersion: 0,
      }),
    ).toThrow(BadRequestException);
  });

  it('rejects schemaVersion above MAX supported', () => {
    expect(() =>
      migrateNetworkProfilePayload({
        ...defaultValidInput,
        schemaVersion: 2,
      }),
    ).toThrow(BadRequestException);
  });

  it('rejects non-integer schemaVersion', () => {
    expect(() =>
      migrateNetworkProfilePayload({
        ...defaultValidInput,
        schemaVersion: 1.5,
      }),
    ).toThrow(BadRequestException);
  });

  it('rejects missing horizonUrl', () => {
    expect(() =>
      migrateNetworkProfilePayload({
        ...defaultValidInput,
        horizonUrl: undefined,
      }),
    ).toThrow(BadRequestException);
  });

  it('rejects empty horizonUrl', () => {
    expect(() =>
      migrateNetworkProfilePayload({
        ...defaultValidInput,
        horizonUrl: '',
      }),
    ).toThrow(BadRequestException);
  });

  it('rejects missing networkPassphrase', () => {
    expect(() =>
      migrateNetworkProfilePayload({
        ...defaultValidInput,
        networkPassphrase: undefined,
      }),
    ).toThrow(BadRequestException);
  });

  it('includes friendbotUrl when provided', () => {
    const result = migrateNetworkProfilePayload({
      ...defaultValidInput,
      friendbotUrl: 'https://friendbot.stellar.org',
    });
    expect(result.friendbotUrl).toBe('https://friendbot.stellar.org');
  });

  it('omits friendbotUrl when not provided', () => {
    const result = migrateNetworkProfilePayload(defaultValidInput);
    expect(result.friendbotUrl).toBeUndefined();
  });

  it('sets isDefault when provided as boolean', () => {
    const result = migrateNetworkProfilePayload({
      ...defaultValidInput,
      isDefault: true,
    });
    expect(result.isDefault).toBe(true);
  });

  it('does not set isDefault when provided as non-boolean', () => {
    const result = migrateNetworkProfilePayload({
      ...defaultValidInput,
      isDefault: 'yes',
    });
    expect(result.isDefault).toBeUndefined();
  });

  it('defaults name to "Imported Profile" when omitted', () => {
    const result = migrateNetworkProfilePayload({
      horizonUrl: 'https://horizon-testnet.stellar.org',
      networkPassphrase: 'Test SDF Network ; September 2015',
    });
    expect(result.name).toBe('Imported Profile');
  });

  it('trims trailing slashes from horizonUrl', () => {
    const result = migrateNetworkProfilePayload({
      ...defaultValidInput,
      horizonUrl: 'https://horizon-testnet.stellar.org/',
    });
    expect(result.horizonUrl).toBe('https://horizon-testnet.stellar.org');
  });

  it('returns profile with correct shape', () => {
    const input = {
      schemaVersion: 1,
      name: 'custom-name',
      horizonUrl: 'https://horizon-testnet.stellar.org',
      networkPassphrase: 'passphrase',
      friendbotUrl: 'https://friendbot.stellar.org',
      isDefault: false,
    };
    const result = migrateNetworkProfilePayload(input);
    expect(result).toHaveProperty('name', 'custom-name');
    expect(result).toHaveProperty('horizonUrl', 'https://horizon-testnet.stellar.org');
    expect(result).toHaveProperty('networkPassphrase', 'passphrase');
    expect(result).toHaveProperty('friendbotUrl', 'https://friendbot.stellar.org');
    expect(result).toHaveProperty('isDefault', false);
  });
});