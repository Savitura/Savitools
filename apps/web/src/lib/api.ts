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

/* ─── Playground ─────────────────────────────────────────────────────────── */

export type PlaygroundProvider = 'fluxa' | 'crowdpay';

export interface PlaygroundApiKey {
  id: string;
  label: string;
  provider: PlaygroundProvider;
  maskedKey: string;
  createdAt: string;
}

export interface PlaygroundProxyRequest {
  provider: PlaygroundProvider;
  method: string;
  path: string;
  query?: Record<string, string>;
  body?: unknown;
  headers?: Record<string, string>;
}

export interface PlaygroundProxyResult {
  status: number;
  headers: Record<string, string>;
  body: unknown;
  latencyMs: number;
}

export async function fetchPlaygroundSpec(provider: PlaygroundProvider) {
  return apiFetch<{ provider: PlaygroundProvider; spec: Record<string, unknown> }>(
    `/playground/spec/${provider}`,
  );
}

export async function proxyPlaygroundRequest(dto: PlaygroundProxyRequest) {
  return apiFetch<PlaygroundProxyResult>('/playground/proxy', {
    method: 'POST',
    body: JSON.stringify(dto),
  });
}

export async function savePlaygroundApiKey(
  provider: PlaygroundProvider,
  label: string,
  apiKey: string,
) {
  return apiFetch<{ id: string; label: string; provider: PlaygroundProvider }>(
    '/playground/keys',
    {
      method: 'POST',
      body: JSON.stringify({ provider, label, apiKey }),
    },
  );
}

export async function listPlaygroundApiKeys() {
  return apiFetch<PlaygroundApiKey[]>('/playground/keys');
}

export async function deletePlaygroundApiKey(id: string) {
  return apiFetch<{ success: boolean }>(`/playground/keys/${id}`, {
    method: 'DELETE',
  });
}

/* ─── Simulator ──────────────────────────────────────────────────────────── */

export type Direction = 'strict_send' | 'strict_receive';
export type AssetType = 'native' | 'credit_alphanum4' | 'credit_alphanum12';
export type NetworkChoice = 'mainnet' | 'testnet';

export interface SimulatedAsset {
  type: AssetType;
  code?: string;
  issuer?: string;
  label: string;
}

export interface SimulatedPath {
  source_asset: SimulatedAsset;
  destination_asset: SimulatedAsset;
  source_amount: string;
  destination_amount: string;
  path: SimulatedAsset[];
  effective_rate: string;
  estimated_fee: string;
  recommended_slippage: number;
  hops: number;
}

export interface FindPathsResponse {
  paths: SimulatedPath[];
  direction: Direction;
}

export interface FindPathsParams {
  direction: Direction;
  source_asset_type: AssetType;
  source_asset_code?: string;
  source_asset_issuer?: string;
  amount: string;
  destination_asset_type: AssetType;
  destination_asset_code?: string;
  destination_asset_issuer?: string;
  network?: NetworkChoice;
}

export interface EstimateResult {
  destination_min?: string;
  send_max?: string;
  source_amount: string;
  destination_amount: string;
  path: SimulatedAsset[];
}

export interface EstimateParams {
  direction: Direction;
  amount: string;
  source_asset: { type: AssetType; code?: string; issuer?: string };
  destination_asset: { type: AssetType; code?: string; issuer?: string };
  path_assets?: Array<{ type: AssetType; code?: string; issuer?: string }>;
  slippage_percent: number;
  network?: NetworkChoice;
}

export async function findSimulatorPaths(params: FindPathsParams) {
  const searchParams = new URLSearchParams();
  searchParams.set('direction', params.direction);
  searchParams.set('source_asset_type', params.source_asset_type);
  searchParams.set('amount', params.amount);
  searchParams.set('destination_asset_type', params.destination_asset_type);
  if (params.source_asset_code) searchParams.set('source_asset_code', params.source_asset_code);
  if (params.source_asset_issuer) searchParams.set('source_asset_issuer', params.source_asset_issuer);
  if (params.destination_asset_code) searchParams.set('destination_asset_code', params.destination_asset_code);
  if (params.destination_asset_issuer) searchParams.set('destination_asset_issuer', params.destination_asset_issuer);
  if (params.network) searchParams.set('network', params.network);

  return apiFetch<FindPathsResponse>(`/simulator/paths?${searchParams.toString()}`);
}

export async function estimateSlippage(params: EstimateParams) {
  return apiFetch<EstimateResult>('/simulator/estimate', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

/* ─── Webhooks ──────────────────────────────────────────────────────────── */

export interface WebhookTemplate {
  provider: 'crowdpay' | 'fluxa';
  eventType: string;
  description: string;
  schema: Record<string, string>;
  samplePayload: Record<string, unknown>;
}

export interface WebhookSendRequest {
  endpointUrl: string;
  eventType: string;
  payload?: Record<string, unknown>;
  secret?: string;
}

export interface WebhookHistoryEntry {
  id: string;
  eventType: string;
  endpointUrl: string;
  payload: Record<string, unknown>;
  requestHeaders: Record<string, string>;
  statusCode: number | null;
  responseHeaders: Record<string, string>;
  responseBody: unknown;
  latencyMs: number;
  timestamp: number;
  error?: string;
}

export async function fetchWebhookTemplates() {
  return apiFetch<WebhookTemplate[]>('/webhooks/templates');
}

export async function sendWebhook(dto: WebhookSendRequest) {
  return apiFetch<WebhookHistoryEntry>('/webhooks/send', {
    method: 'POST',
    body: JSON.stringify(dto),
  });
}

export async function fetchWebhookHistory() {
  return apiFetch<WebhookHistoryEntry[]>('/webhooks/history');
}

export async function replayWebhook(id: string) {
  return apiFetch<WebhookHistoryEntry>(`/webhooks/replay/${id}`, {
    method: 'POST',
  });
}
/* ─── Wallet ─────────────────────────────────────────────────────────────── */

export interface GenerateKeypairResult {
  publicKey: string;
  secretKey: string;
}

export interface FundResult {
  publicKey: string;
  funded: boolean;
  txHash: string | null;
  startingBalance: string;
}

export interface Balance {
  assetType: string;
  assetCode: string | null;
  assetIssuer: string | null;
  balance: string;
  limit?: string;
}

export interface BalancesResult {
  publicKey: string;
  balances: Balance[];
}

export interface SendPaymentResult {
  success: boolean;
  txHash: string;
  destination: string;
  asset: string;
  amount: string;
}

export async function generateKeypair() {
  return apiFetch<GenerateKeypairResult>('/wallet/generate', {
    method: 'POST',
  });
}

export async function fundFromFriendbot(publicKey: string) {
  return apiFetch<FundResult>('/wallet/fund', {
    method: 'POST',
    body: JSON.stringify({ publicKey }),
  });
}

export async function getBalances(publicKey: string) {
  return apiFetch<BalancesResult>(`/wallet/balances?publicKey=${encodeURIComponent(publicKey)}`);
}

export async function sendPayment(
  sourceSecret: string,
  destination: string,
  asset: string,
  amount: string,
) {
  return apiFetch<SendPaymentResult>('/wallet/payment', {
    method: 'POST',
    body: JSON.stringify({ sourceSecret, destination, asset, amount }),
  });
}

/* ─── Sandbox ─────────────────────────────────────────────────────────────── */

export interface SandboxAccountDetails {
  publicKey: string;
  sequenceNumber: string;
  balances: Balance[];
  signers: Array<{ publicKey: string; weight: number }>;
  thresholds: {
    lowThreshold: number;
    medThreshold: number;
    highThreshold: number;
  };
  flags: {
    authRequired: boolean;
    authRevocable: boolean;
    authImmutable: boolean;
  };
}

export interface SandboxFundResult {
  publicKey: string;
  funded: boolean;
  txHash: string | null;
  confirmationStatus: string;
  startingBalance: string;
}

export interface SandboxPaymentResult {
  success: boolean;
  txHash: string;
  feeCharged: number;
  resultCode: string;
  destination: string;
  asset: string;
  amount: string;
}

export async function sandboxFund(publicKey: string) {
  return apiFetch<SandboxFundResult>('/sandbox/fund', {
    method: 'POST',
    body: JSON.stringify({ publicKey }),
  });
}

export async function sandboxGetAccount(publicKey: string) {
  return apiFetch<SandboxAccountDetails>(`/sandbox/account/${encodeURIComponent(publicKey)}`);
}

export async function sandboxSendPayment(
  fromSecret: string,
  toPublicKey: string,
  asset: string,
  amount: string,
  memo?: string,
) {
  return apiFetch<SandboxPaymentResult>('/sandbox/payment', {
    method: 'POST',
    body: JSON.stringify({ fromSecret, toPublicKey, asset, amount, memo }),
  });
}

/* ─── Simulator ──────────────────────────────────────────────────────────── */

export interface PathHop {
  assetType: string;
  assetCode: string | null;
  assetIssuer: string | null;
}

export interface SimulatedPath {
  sourceAmount: string;
  destinationAmount: string;
  path: PathHop[];
  pathLength: number;
  exchangeRate: string;
}

export interface SimulateStrictSendResult {
  sourceAsset: string;
  sourceAmount: string;
  destAsset: string;
  network: string;
  mode: 'strict_send';
  totalPathsFound: number;
  paths: SimulatedPath[];
  bestPath: SimulatedPath;
  slippagePercent: string;
}

export interface SimulateStrictReceiveResult {
  sourceAsset: string;
  destAsset: string;
  destAmount: string;
  network: string;
  mode: 'strict_receive';
  totalPathsFound: number;
  paths: SimulatedPath[];
  bestPath: SimulatedPath;
  sourceAmountNeeded: string;
  slippagePercent: string;
}

export type SimulatePathResult = SimulateStrictSendResult | SimulateStrictReceiveResult;

export interface SimulateFeeResult {
  network: string;
  operations: number;
  baseFeeStroops: number;
  totalFeeStroops: number;
  totalFeeXlm: string;
  feeChargedPercentiles: {
    p10: string;
    p50: string;
    p90: string;
    p99: string;
  };
  lastLedger: number;
}

export async function simulateStrictSend(dto: {
  sourceAsset: string;
  sourceAmount: string;
  destAsset: string;
  network: string;
}) {
  return apiFetch<SimulateStrictSendResult>('/simulator/path-send', {
    method: 'POST',
    body: JSON.stringify(dto),
  });
}

export async function simulateStrictReceive(dto: {
  sourceAsset: string;
  destAmount: string;
  destAsset: string;
  network: string;
}) {
  return apiFetch<SimulateStrictReceiveResult>('/simulator/path-receive', {
    method: 'POST',
    body: JSON.stringify(dto),
  });
}

export async function simulateFee(operations: number, network: string) {
  return apiFetch<SimulateFeeResult>(
    `/simulator/fee?operations=${operations}&network=${network}`,
  );
}
