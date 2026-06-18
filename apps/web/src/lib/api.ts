const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';

export interface AuthUser {
  id: string;
  email: string;
  fluxaTenantId: string | null;
}

interface ApiErrorBody {
  message?: string | string[];
}

async function parseJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as ApiErrorBody;
    const message = Array.isArray(body.message)
      ? body.message.join(', ')
      : body.message ?? response.statusText;
    throw new Error(message);
  }

  return response.json() as Promise<T>;
}

export async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${API_URL}/v1${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });

  return parseJson<T>(response);
}

export async function register(email: string, password: string) {
  return apiFetch<{ user: AuthUser }>('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export async function login(email: string, password: string) {
  return apiFetch<{ user: AuthUser }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export async function logout() {
  return apiFetch<{ success: boolean }>('/auth/logout', { method: 'POST' });
}

export async function refreshSession() {
  return apiFetch<{ user?: AuthUser; authenticated?: false }>('/auth/refresh', {
    method: 'POST',
  });
}

export async function getCurrentUser() {
  return apiFetch<{ user: AuthUser | null }>('/auth/me');
}

export async function connectFluxa(apiKey: string) {
  return apiFetch<{ user: AuthUser }>('/auth/fluxa', {
    method: 'POST',
    body: JSON.stringify({ apiKey }),
  });
}

export type WorkspaceTool = 'sandbox' | 'inspector' | 'webhooks' | 'composer';

export async function getWorkspace(tool: WorkspaceTool) {
  return apiFetch<{ tool: WorkspaceTool; data: Record<string, unknown> }>(
    `/workspaces/${tool}`,
  );
}

export async function saveWorkspace(tool: WorkspaceTool, data: Record<string, unknown>) {
  return apiFetch<{ tool: WorkspaceTool; data: Record<string, unknown> }>(
    `/workspaces/${tool}`,
    {
      method: 'PUT',
      body: JSON.stringify({ data }),
    },
  );
}

/* ─── Contracts ─────────────────────────────────────────────────────────── */

export interface DeployedContract {
  contractId: string;
  wasmHash: string;
  deployedAt: string;
  network: string;
}

interface DeployResult {
  contractId: string;
  wasmHash: string;
  txHash: string;
}

interface InvokeResult {
  result: unknown;
  txHash: string;
}

interface ContractInfo {
  contractId: string;
  wasmHash: string;
  network: string;
}

async function apiFetchFormData<T>(path: string, formData: FormData): Promise<T> {
  const response = await fetch(`${API_URL}/v1${path}`, {
    method: 'POST',
    credentials: 'include',
    body: formData,
  });

  return parseJson<T>(response);
}

export async function deployContract(formData: FormData) {
  return apiFetchFormData<DeployResult>('/contracts/deploy', formData);
}

export async function invokeContract(
  contractId: string,
  functionName: string,
  args: unknown[],
) {
  return apiFetch<InvokeResult>(`/contracts/${contractId}/invoke`, {
    method: 'POST',
    body: JSON.stringify({ functionName, args }),
  });
}

export async function getContractInfo(contractId: string) {
  return apiFetch<ContractInfo>(`/contracts/${contractId}/info`);
}
