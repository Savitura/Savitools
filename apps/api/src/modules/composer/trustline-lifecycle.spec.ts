import { Keypair } from '@stellar/stellar-sdk';
import { buildTrustlineOperation, trustlineLimitForAction } from './trustline-lifecycle';

describe('trustline lifecycle builder', () => {
  it('builds open/update operations and encodes removal as zero', () => {
    const issuer = Keypair.random().publicKey();
    expect(trustlineLimitForAction('open')).toBe('922337203685.4775807');
    expect(trustlineLimitForAction('remove', '100')).toBe('0');
    const operation = buildTrustlineOperation({ code: 'USDC', issuer, limit: '100' });
    expect(operation).toBeDefined();
  });

  it('rejects malformed assets and negative limits', () => {
    const issuer = Keypair.random().publicKey();
    expect(() => buildTrustlineOperation({ code: 'XLM', issuer })).toThrow();
    expect(() => buildTrustlineOperation({ code: 'USDC', issuer, limit: '-1' })).toThrow();
  });
});
