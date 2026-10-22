/**
 * Versioned wire format for exported/imported network profiles and for the
 * profile list kept in localStorage.
 *
 * Version 1 is the first explicit schema. Files written before this module
 * existed had no version field; they are treated as version 1 so an old export
 * keeps importing instead of being stranded.
 */
export const NETWORK_PROFILE_SCHEMA_VERSION = 1;
/** Alias used by callers that follow the workspace format naming. */
export const NETWORK_PROFILE_FORMAT_VERSION = NETWORK_PROFILE_SCHEMA_VERSION;
export const MIN_SUPPORTED_NETWORK_PROFILE_VERSION = 1;

export type NetworkProfileFormatErrorCode =
  'INVALID_JSON' | 'INVALID_PROFILE' | 'UNSUPPORTED_VERSION';

export class NetworkProfileFormatError extends Error {
  readonly code: NetworkProfileFormatErrorCode;

  constructor(code: NetworkProfileFormatErrorCode, message: string) {
    super(message);
    this.name = 'NetworkProfileFormatError';
    this.code = code;
  }
}

export interface NetworkProfileFile {
  schemaVersion: number;
  name: string;
  horizonUrl: string;
  networkPassphrase: string;
  friendbotUrl?: string;
  /** Storage-only metadata; never written to an exported profile. */
  id?: string;
  isDefault?: boolean;
}

export interface NetworkProfileFileInput {
  schemaVersion?: number;
  name?: string;
  horizonUrl: string;
  networkPassphrase: string;
  friendbotUrl?: string | null;
  id?: string;
  isDefault?: boolean;
}

export interface NetworkProfileStore {
  schemaVersion: number;
  profiles: NetworkProfileFile[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readSchemaVersion(value: Record<string, unknown>): number {
  const raw = value.schemaVersion ?? value.formatVersion ?? value.version;
  if (raw === undefined) {
    // Files written before the version field existed are the legacy format.
    return MIN_SUPPORTED_NETWORK_PROFILE_VERSION;
  }

  if (typeof raw !== 'number' || !Number.isInteger(raw)) {
    throw new NetworkProfileFormatError(
      'UNSUPPORTED_VERSION',
      'Network profile schemaVersion must be an integer.',
    );
  }

  return raw;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function requiredString(value: unknown, field: string): string {
  const text = optionalString(value);
  if (!text) {
    throw new NetworkProfileFormatError(
      'INVALID_PROFILE',
      `Missing or invalid "${field}". A network profile needs a non-empty ${field}.`,
    );
  }
  return text;
}

/**
 * Convert a legacy or current stored profile into the current in-memory shape.
 *
 * Validation happens before any caller state is mutated, so a malformed or
 * future-version profile cannot leave the profile list half-imported.
 */
export function migrateNetworkProfile(parsed: unknown): NetworkProfileFile {
  if (!isRecord(parsed)) {
    throw new NetworkProfileFormatError(
      'INVALID_PROFILE',
      'Network profile JSON must be an object.',
    );
  }

  const version = readSchemaVersion(parsed);
  if (version < MIN_SUPPORTED_NETWORK_PROFILE_VERSION || version > NETWORK_PROFILE_SCHEMA_VERSION) {
    throw new NetworkProfileFormatError(
      'UNSUPPORTED_VERSION',
      `Network profile schema version ${version} is not supported. This build supports versions ${MIN_SUPPORTED_NETWORK_PROFILE_VERSION}–${NETWORK_PROFILE_SCHEMA_VERSION}.`,
    );
  }

  const migrated: NetworkProfileFile = {
    schemaVersion: NETWORK_PROFILE_SCHEMA_VERSION,
    name: optionalString(parsed.name) ?? 'Imported Profile',
    horizonUrl: requiredString(parsed.horizonUrl, 'horizonUrl').replace(/\/+$/, ''),
    networkPassphrase: requiredString(parsed.networkPassphrase, 'networkPassphrase'),
  };

  const friendbotUrl = optionalString(parsed.friendbotUrl);
  if (friendbotUrl) migrated.friendbotUrl = friendbotUrl;
  if (typeof parsed.id === 'string' && parsed.id.trim()) migrated.id = parsed.id.trim();
  if (typeof parsed.isDefault === 'boolean') migrated.isDefault = parsed.isDefault;

  return migrated;
}

export function parseNetworkProfile(json: string): NetworkProfileFile {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new NetworkProfileFormatError('INVALID_JSON', 'Invalid network profile JSON file.');
  }

  return migrateNetworkProfile(parsed);
}

/**
 * Serialise a single profile for export. `id`/`isDefault` are instance
 * metadata and stay out of the file, but the schema version is always present.
 */
export function serializeNetworkProfile(
  profile: NetworkProfileFileInput,
  space: number = 2,
): string {
  const migrated = migrateNetworkProfile({
    ...profile,
    schemaVersion: NETWORK_PROFILE_SCHEMA_VERSION,
  });

  const output = {
    schemaVersion: migrated.schemaVersion,
    name: migrated.name,
    horizonUrl: migrated.horizonUrl,
    networkPassphrase: migrated.networkPassphrase,
    ...(migrated.friendbotUrl ? { friendbotUrl: migrated.friendbotUrl } : {}),
  };

  return JSON.stringify(output, null, space);
}

/**
 * Parse the localStorage store. Both the historical bare array and the
 * versioned `{ schemaVersion, profiles }` envelope are accepted.
 */
export function parseNetworkProfileStore(json: string): NetworkProfileFile[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new NetworkProfileFormatError('INVALID_JSON', 'Invalid stored network profiles.');
  }

  const rawProfiles = Array.isArray(parsed)
    ? parsed
    : isRecord(parsed)
      ? parsed.profiles
      : undefined;

  if (!Array.isArray(rawProfiles)) {
    throw new NetworkProfileFormatError(
      'INVALID_PROFILE',
      'Stored network profiles must be an array or an object with a "profiles" array.',
    );
  }

  if (!Array.isArray(parsed)) {
    const record = parsed as Record<string, unknown>;
    if (
      record.schemaVersion === undefined &&
      record.formatVersion === undefined &&
      record.version === undefined
    ) {
      throw new NetworkProfileFormatError(
        'INVALID_PROFILE',
        'Stored network profile envelope is missing schemaVersion.',
      );
    }
    const version = readSchemaVersion(record);
    if (
      version < MIN_SUPPORTED_NETWORK_PROFILE_VERSION ||
      version > NETWORK_PROFILE_SCHEMA_VERSION
    ) {
      throw new NetworkProfileFormatError(
        'UNSUPPORTED_VERSION',
        `Network profile store schema version ${version} is not supported. This build supports versions ${MIN_SUPPORTED_NETWORK_PROFILE_VERSION}–${NETWORK_PROFILE_SCHEMA_VERSION}.`,
      );
    }
  }

  return rawProfiles.map((profile) => migrateNetworkProfile(profile));
}

export function serializeNetworkProfileStore(
  profiles: NetworkProfileFileInput[],
  space: number = 0,
): string {
  const store: NetworkProfileStore = {
    schemaVersion: NETWORK_PROFILE_SCHEMA_VERSION,
    profiles: profiles.map((profile) => ({
      ...migrateNetworkProfile({
        ...profile,
        schemaVersion: NETWORK_PROFILE_SCHEMA_VERSION,
      }),
      isDefault: profile.isDefault ?? false,
    })),
  };
  return JSON.stringify(store, null, space);
}
