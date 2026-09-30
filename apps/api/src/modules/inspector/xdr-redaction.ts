import { Networks, TransactionBuilder } from '@stellar/stellar-sdk';

export const REDACTED_XDR = '[REDACTED_XDR]';

export interface SafeXdrDiagnostic {
  valid: boolean;
  network: 'mainnet' | 'testnet';
  sourceAccount?: string;
  operationCount?: number;
  signatureCount?: number;
  memo: '[REDACTED]';
  xdr: typeof REDACTED_XDR;
  error?: 'invalid_xdr';
}

/**
 * Turn a transaction envelope into copy-safe diagnostics. The original XDR,
 * memo, and signatures are never returned; callers can share this object
 * without leaking payment metadata or replayable authorization material.
 */
export function redactTransactionXdr(rawXdr: string, network: 'mainnet' | 'testnet' = 'testnet'): SafeXdrDiagnostic {
  try {
    const passphrase = network === 'mainnet' ? Networks.PUBLIC : Networks.TESTNET;
    const tx = TransactionBuilder.fromXDR(rawXdr, passphrase) as any;
    return {
      valid: true,
      network,
      sourceAccount: tx.source,
      operationCount: Array.isArray(tx.operations) ? tx.operations.length : 0,
      signatureCount: Array.isArray(tx.signatures) ? tx.signatures.length : 0,
      memo: '[REDACTED]',
      xdr: REDACTED_XDR,
    };
  } catch {
    return { valid: false, network, memo: '[REDACTED]', xdr: REDACTED_XDR, error: 'invalid_xdr' };
  }
}
