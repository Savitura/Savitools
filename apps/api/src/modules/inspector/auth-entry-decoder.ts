import * as StellarSdk from '@stellar/stellar-sdk';

export interface DecodedAuthorizationEntry {
  credentials?: Record<string, unknown>;
  rootInvocation?: Record<string, unknown>;
  diagnostics: string[];
  sanitized: Record<string, unknown>;
  [key: string]: unknown;
}

export function decodeAuthorizationEntry(
  xdrBase64: string,
  _currentLedger?: number,
): DecodedAuthorizationEntry {
  const diagnostics: string[] = [];
  try {
    const entry = StellarSdk.xdr.SorobanAuthorizationEntry.fromXDR(xdrBase64, 'base64');
    const credentials = entry.credentials().switch().name;
    const sanitized: Record<string, unknown> = {
      credentialsType: credentials,
      xdr: xdrBase64,
    };
    return {
      credentials: { type: credentials },
      rootInvocation: {},
      diagnostics,
      sanitized,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    diagnostics.push(`Failed to parse authorization entry: ${msg}`);
    return {
      diagnostics,
      sanitized: { xdr: xdrBase64, error: msg },
    };
  }
}
