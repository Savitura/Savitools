import { Account, Keypair, Networks, TransactionBuilder } from '@stellar/stellar-sdk';
import { detectTransactionNetwork } from './network-detector';

describe('detectTransactionNetwork', () => {
  it('cryptographically identifies a signed testnet envelope', () => {
    const keypair = Keypair.random();
    const tx = new TransactionBuilder(new Account(keypair.publicKey(), '1'), {
      fee: '100', networkPassphrase: Networks.TESTNET,
    }).setTimeout(60).build();
    tx.sign(keypair);
    expect(detectTransactionNetwork(tx.toXDR())).toMatchObject({ network: 'testnet', confidence: 'cryptographic' });
  });

  it('does not guess for unsigned XDR', () => {
    const keypair = Keypair.random();
    const tx = new TransactionBuilder(new Account(keypair.publicKey(), '1'), {
      fee: '100', networkPassphrase: Networks.PUBLIC,
    }).setTimeout(60).build();
    expect(detectTransactionNetwork(tx.toXDR())).toMatchObject({ network: 'unknown', signed: false });
  });
});
