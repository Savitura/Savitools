import { zeroBuffer } from '@/lib/secure-memory';

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

  // Security: wipe the raw Ed25519 seed held by the keypair as soon as the
  // signature has been produced, so the secret is not left in the JS heap
  // (see Savitura/Savitools#145). The caller should also drop its own
  // reference to `secretKey` (e.g. clear the input) after this returns.
  const raw = keypair.rawSecretKey?.();
  if (raw) zeroBuffer(raw);

  return tx.toXDR();
}
