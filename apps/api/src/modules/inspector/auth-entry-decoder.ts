/**
 * Minimal Soroban authorization-entry decoder surface used by InspectorService.
 * Full decoding lands with the auth-entry tool work; this stub keeps the module
 * type-checkable while returning structured placeholders for malformed input.
 */

export interface DecodedAuthorizationEntry {
  raw: string;
  diagnostics: string[];
  sanitized: Record<string, unknown>;
  credentials?: Record<string, unknown>;
  rootInvocation?: Record<string, unknown>;
}

export function decodeAuthorizationEntry(
  xdr: string,
  _currentLedger?: number,
): DecodedAuthorizationEntry {
  if (!xdr || typeof xdr !== 'string') {
    throw new Error('Authorization entry XDR must be a non-empty string');
  }
  return {
    raw: xdr,
    diagnostics: ['auth-entry-decoder: structured decode not yet available'],
    sanitized: { xdrPresent: true },
  };
}
