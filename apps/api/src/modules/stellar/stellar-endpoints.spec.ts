import { resolveStellarEndpoints, STANDALONE_PASSPHRASE } from './stellar-endpoints';

describe('StellarEndpoints', () => {
  it('resolves testnet endpoints correctly', () => {
    const endpoints = resolveStellarEndpoints('testnet');
    expect(endpoints.network).toBe('TESTNET');
    expect(endpoints.horizonUrl).toBeDefined();
    expect(endpoints.rpcUrl).toBeDefined();
  });

  it('resolves standalone endpoints with passphrase', () => {
    const endpoints = resolveStellarEndpoints('standalone');
    expect(endpoints.passphrase).toBe(STANDALONE_PASSPHRASE);
  });
});
