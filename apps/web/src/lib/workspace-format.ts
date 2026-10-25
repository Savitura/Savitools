/**
 * Versioned wire format for exported/imported composer workspaces.
 *
 * Version 1 is the historical, unversioned shape: a JSON object with
 * `composerState` and (optionally) top-level `operations`. Version 2 adds the
 * explicit `formatVersion` field so future changes can migrate deterministically
 * instead of guessing what a stored file contains.
 */
export const WORKSPACE_FORMAT_VERSION = 2;
export const MIN_SUPPORTED_WORKSPACE_VERSION = 1;

export type WorkspaceFormatErrorCode = 'INVALID_JSON' | 'INVALID_WORKSPACE' | 'UNSUPPORTED_VERSION';

export class WorkspaceFormatError extends Error {
  readonly code: WorkspaceFormatErrorCode;

  constructor(code: WorkspaceFormatErrorCode, message: string) {
    super(message);
    this.name = 'WorkspaceFormatError';
    this.code = code;
  }
}

export interface WorkspaceFile {
  formatVersion: number;
  id?: string;
  ownerId?: string;
  name?: string;
  composerState: Record<string, unknown>;
  operations: unknown[];
  createdAt?: string;
  updatedAt?: string;
}

export interface WorkspaceFileInput extends Omit<WorkspaceFile, 'formatVersion'> {
  formatVersion?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readFormatVersion(value: Record<string, unknown>): number {
  if (value.formatVersion === undefined) {
    // Files written before the version field existed are the v1 format.
    return MIN_SUPPORTED_WORKSPACE_VERSION;
  }

  if (typeof value.formatVersion !== 'number' || !Number.isInteger(value.formatVersion)) {
    throw new WorkspaceFormatError(
      'UNSUPPORTED_VERSION',
      'Workspace formatVersion must be an integer.',
    );
  }

  return value.formatVersion;
}

/**
 * Convert any supported stored shape into the current in-memory format.
 *
 * The whole file is validated before the caller mutates UI state, so an
 * unsupported future version cannot leave the composer half-imported.
 */
export function migrateWorkspaceFile(parsed: unknown): WorkspaceFile {
  if (!isRecord(parsed)) {
    throw new WorkspaceFormatError('INVALID_WORKSPACE', 'Workspace JSON must be an object.');
  }

  const version = readFormatVersion(parsed);
  if (version < MIN_SUPPORTED_WORKSPACE_VERSION || version > WORKSPACE_FORMAT_VERSION) {
    throw new WorkspaceFormatError(
      'UNSUPPORTED_VERSION',
      `Workspace format version ${version} is not supported. This build supports versions ${MIN_SUPPORTED_WORKSPACE_VERSION}–${WORKSPACE_FORMAT_VERSION}.`,
    );
  }

  const composerState = parsed.composerState;
  if (!isRecord(composerState)) {
    throw new WorkspaceFormatError('INVALID_WORKSPACE', 'Missing or invalid "composerState".');
  }

  const operations = Array.isArray(parsed.operations)
    ? parsed.operations
    : Array.isArray(composerState.operations)
      ? composerState.operations
      : null;

  if (!operations) {
    throw new WorkspaceFormatError('INVALID_WORKSPACE', 'Missing or invalid "operations" array.');
  }

  const migrated: WorkspaceFile = {
    formatVersion: WORKSPACE_FORMAT_VERSION,
    composerState: { ...composerState, operations },
    operations,
  };

  if (typeof parsed.id === 'string') migrated.id = parsed.id;
  if (typeof parsed.ownerId === 'string') migrated.ownerId = parsed.ownerId;
  if (typeof parsed.name === 'string') migrated.name = parsed.name;
  if (typeof parsed.createdAt === 'string') migrated.createdAt = parsed.createdAt;
  if (typeof parsed.updatedAt === 'string') migrated.updatedAt = parsed.updatedAt;

  return migrated;
}

export function parseWorkspaceFile(json: string): WorkspaceFile {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new WorkspaceFormatError('INVALID_JSON', 'Invalid JSON file.');
  }

  return migrateWorkspaceFile(parsed);
}

/**
 * Secret key prefixes and patterns for Stellar and generic credentials.
 */
export const STELLAR_SECRET_SEED_REGEX = /^S[A-Z2-7]{55}$/;
export const STELLAR_SECRET_SEED_ANYWHERE_REGEX = /S[A-Z2-7]{55}/g;

export const JWT_REGEX = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
export const BEARER_REGEX = /^Bearer\s+[A-Za-z0-9_.-]+/i;

export const SENSITIVE_KEY_SUBSTRINGS = [
  'secret',
  'private',
  'seed',
  'password',
  'token',
  'jwt',
  'authorization',
  'credential',
  'cookie',
  'apikey',
  'api_key',
  'signingkey',
  'signing_key',
  'privatekey',
  'private_key',
  'secretkey',
  'secret_key',
];

export const SIGNATURE_KEY_SUBSTRINGS = [
  'signedtransaction',
  'signed_transaction',
  'signedxdr',
  'signed_xdr',
  'signedenvelope',
  'signed_envelope',
  'signatures',
  'signature',
];

export function isSensitiveKey(key: string): boolean {
  const lower = key.toLowerCase();
  return SENSITIVE_KEY_SUBSTRINGS.some((sub) => lower.includes(sub));
}

export function isSignatureKey(key: string): boolean {
  const lower = key.toLowerCase();
  if (lower.includes('unsigned')) {
    return false;
  }
  return SIGNATURE_KEY_SUBSTRINGS.some((sub) => lower.includes(sub));
}

/**
 * Sanitizes workspace payload (e.g. composerState, operations) before export or storage,
 * stripping secret keys, private seeds, bearer/JWT tokens, signatures, and signed transactions.
 */
export function sanitizeWorkspacePayload<T>(value: T, keyName?: string): T {
  if (value === null || value === undefined) {
    return value;
  }

  if (keyName && (isSensitiveKey(keyName) || isSignatureKey(keyName))) {
    return undefined as unknown as T;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (STELLAR_SECRET_SEED_REGEX.test(trimmed)) {
      return undefined as unknown as T;
    }
    if (JWT_REGEX.test(trimmed) || BEARER_REGEX.test(trimmed)) {
      return undefined as unknown as T;
    }
    if (/S[A-Z2-7]{55}/.test(value)) {
      return value.replace(/S[A-Z2-7]{55}/g, '[REDACTED]') as unknown as T;
    }
    return value;
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => sanitizeWorkspacePayload(item))
      .filter((item) => item !== undefined) as unknown as T;
  }

  if (typeof value === 'object') {
    const cleaned: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (isSensitiveKey(k) || isSignatureKey(k)) {
        continue;
      }
      const cleanedVal = sanitizeWorkspacePayload(v, k);
      if (cleanedVal !== undefined) {
        cleaned[k] = cleanedVal;
      }
    }
    return cleaned as unknown as T;
  }

  return value;
}

/**
 * Serialise an export at the current format version. Callers can pass legacy
 * metadata, but the emitted file always advertises `WORKSPACE_FORMAT_VERSION`
 * and is guaranteed to be sanitized of secrets and signed transactions.
 */
export function serializeWorkspaceFile(file: WorkspaceFileInput, space: number = 2): string {
  const composerState = (sanitizeWorkspacePayload(file.composerState) ?? {}) as Record<
    string,
    unknown
  >;
  const operations = (sanitizeWorkspacePayload(file.operations) ?? []) as unknown[];

  const output: WorkspaceFile = {
    formatVersion: WORKSPACE_FORMAT_VERSION,
    composerState,
    operations,
  };

  if (file.id !== undefined) output.id = file.id;
  if (file.ownerId !== undefined) output.ownerId = file.ownerId;
  if (file.name !== undefined) output.name = file.name;
  if (file.createdAt !== undefined) output.createdAt = file.createdAt;
  if (file.updatedAt !== undefined) output.updatedAt = file.updatedAt;

  return JSON.stringify(output, null, space);
}
