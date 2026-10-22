import { Account, Keypair, Networks, TransactionBuilder } from '@stellar/stellar-sdk';
import { REDACTED_XDR, redactTransactionXdr } from './xdr-redaction';

describe('redactTransactionXdr', () => {
  it('keeps only safe structural metadata', () => {
    const keypair = Keypair.random();
    const tx = new TransactionBuilder(new Account(keypair.publicKey(), '1'), {
      fee: '100', networkPassphrase: Networks.TESTNET,
    }).setTimeout(60).build();
    tx.sign(keypair);
    const report = redactTransactionXdr(tx.toXDR());
    expect(report.valid).toBe(true);
    expect(report.xdr).toBe(REDACTED_XDR);
    expect(report.memo).toBe('[REDACTED]');
    expect(JSON.stringify(report)).not.toContain(tx.toXDR());
  });

  it('returns a safe invalid envelope for malformed input', () => {
    expect(redactTransactionXdr('not-xdr')).toEqual({
      valid: false, network: 'testnet', memo: '[REDACTED]', xdr: REDACTED_XDR, error: 'invalid_xdr',
    });
  });
});
