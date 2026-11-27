import { describe, it, expect } from '@jest/globals';
import { Keypair } from '@stellar/stellar-sdk';

describe('stellar-signer error handling', () => {
  it('throws on invalid secret seed or signer configuration', () => {
    const invalidSecret = 'SINVALID';
    expect(() => Keypair.fromSecret(invalidSecret)).toThrow();
  });
});
