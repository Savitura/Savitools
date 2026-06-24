export async function signTransactionXdr(
  unsignedXdr: string,
  secretKey: string,
  network: 'testnet' | 'mainnet',
): Promise<string> {
  const { Keypair, Networks, Transaction } = await import('@stellar/stellar-sdk');
  const passphrase = network === 'mainnet' ? Networks.PUBLIC : Networks.TESTNET;
  const tx = new Transaction(unsignedXdr, passphrase);
  const keypair = Keypair.fromSecret(secretKey);
  tx.sign(keypair);
  return tx.toXDR();
}
