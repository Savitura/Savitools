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
 * Serialise an export at the current format version. Callers can pass legacy
 * metadata, but the emitted file always advertises `WORKSPACE_FORMAT_VERSION`.
 */
export function serializeWorkspaceFile(file: WorkspaceFileInput, space: number = 2): string {
  const output: WorkspaceFile = {
    formatVersion: WORKSPACE_FORMAT_VERSION,
    composerState: file.composerState,
    operations: file.operations,
  };

  if (file.id !== undefined) output.id = file.id;
  if (file.ownerId !== undefined) output.ownerId = file.ownerId;
  if (file.name !== undefined) output.name = file.name;
  if (file.createdAt !== undefined) output.createdAt = file.createdAt;
  if (file.updatedAt !== undefined) output.updatedAt = file.updatedAt;

  return JSON.stringify(output, null, space);
}
