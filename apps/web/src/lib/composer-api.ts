import { apiFetch } from './api';

// ---------------------------------------------------------------------------
// Types mirroring the API DTOs
// ---------------------------------------------------------------------------

export interface AssetInput {
  code: string;
  issuer?: string;
}

export interface PriceInput {
  n: string;
  d: string;
}

export type OperationInput = Record<string, unknown> & { type: string };

export interface BuildTransactionInput {
  sourceAccount: string;
  network?: 'testnet' | 'mainnet';
  memo?: string;
  operations: OperationInput[];
}

export interface BuildTransactionResult {
  xdr: string;
  hash: string;
  operations: number;
  network: string;
}

export interface SimulateTransactionInput {
  xdr: string;
  network?: 'testnet' | 'mainnet';
}

export interface SimulateTransactionResult {
  success: boolean;
  hash: string | null;
  fee: string | null;
  resultCodes: string | null;
  operationResults: string[] | null;
  ledger: number | null;
}

export interface OperationField {
  name: string;
  label: string;
  type: 'text' | 'number' | 'boolean';
  required: boolean;
  placeholder: string;
}

export interface OperationManifestEntry {
  type: string;
  label: string;
  description: string;
  fields: OperationField[];
}

// ---------------------------------------------------------------------------
// API wrappers
// ---------------------------------------------------------------------------

export async function fetchOperations(): Promise<OperationManifestEntry[]> {
  return apiFetch<OperationManifestEntry[]>('/composer/operations');
}

export async function buildTransaction(
  input: BuildTransactionInput,
): Promise<BuildTransactionResult> {
  return apiFetch<BuildTransactionResult>('/composer/build', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function simulateTransaction(
  input: SimulateTransactionInput,
): Promise<SimulateTransactionResult> {
  return apiFetch<SimulateTransactionResult>('/composer/simulate', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function submitToHorizon(
  xdr: string,
  network: 'testnet' | 'mainnet' = 'testnet',
): Promise<{ success: boolean; hash?: string; error?: string }> {
  const horizonUrl =
    network === 'mainnet'
      ? 'https://horizon.stellar.org'
      : 'https://horizon-testnet.stellar.org';

  try {
    const params = new URLSearchParams({ tx: xdr });
    const res = await fetch(`${horizonUrl}/transactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    const data = (await res.json()) as { hash?: string; title?: string };
    if (res.ok && data.hash) return { success: true, hash: data.hash };
    return { success: false, error: data.title ?? 'Submission failed' };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}
