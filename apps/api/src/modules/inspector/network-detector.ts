import { Keypair, Networks, TransactionBuilder } from '@stellar/stellar-sdk';

export type DetectedNetwork = 'mainnet' | 'testnet' | 'unknown' | 'ambiguous';

export interface NetworkDetection {
  network: DetectedNetwork;
  signed: boolean;
  /** False means the XDR was syntactically valid but had no network proof. */
  confidence: 'cryptographic' | 'none' | 'conflict';
}

/**
 * Detect a network from transaction signatures. Unsigned envelopes do not
 * contain a network identifier, so they are intentionally reported unknown.
 */
export function detectTransactionNetwork(rawXdr: string): NetworkDetection {
  const matches: ('mainnet' | 'testnet')[] = [];
  let signed = false;
  for (const [network, passphrase] of [
    ['mainnet', Networks.PUBLIC],
    ['testnet', Networks.TESTNET],
  ] as const) {
    try {
      const transaction = TransactionBuilder.fromXDR(rawXdr, passphrase) as any;
      const signatures = transaction.signatures ?? [];
      if (!signatures.length) continue;
      signed = true;
      const source = transaction.source;
      const keypair = Keypair.fromPublicKey(source);
      if (signatures.some((entry: any) => {
        const signature = typeof entry.signature === 'function' ? entry.signature() : entry.signature;
        return keypair.verify(transaction.hash(), signature);
      })) {
        matches.push(network);
      }
    } catch {
      // Try the other passphrase; malformed XDR is handled by the unknown result.
    }
  }
  if (matches.length === 1) return { network: matches[0], signed: true, confidence: 'cryptographic' };
  if (matches.length > 1) return { network: 'ambiguous', signed: true, confidence: 'conflict' };
  return { network: 'unknown', signed, confidence: 'none' };
}
