import { BadRequestException } from '@nestjs/common';

/**
 * Version of the network-profile import/export payload.
 *
 * Version 1 is the first explicit schema. Payloads written before the field
 * existed are treated as version 1 so legacy exports keep importing.
 */
export const NETWORK_PROFILE_SCHEMA_VERSION = 1;
export const MIN_SUPPORTED_NETWORK_PROFILE_VERSION = 1;

export interface ImportedNetworkProfile {
  name: string;
  horizonUrl: string;
  networkPassphrase: string;
  friendbotUrl?: string;
  isDefault?: boolean;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function requiredString(value: unknown, field: string): string {
  const text = optionalString(value);
  if (!text) {
    throw new BadRequestException(
      `Missing or invalid "${field}". A network profile needs a non-empty ${field}.`,
    );
  }
  return text;
}

/**
 * Validate a profile payload before it reaches the database. Unknown versions
 * fail with an actionable 400 instead of being stored in a shape this build
 * cannot read later.
 */
export function migrateNetworkProfilePayload(input: {
  schemaVersion?: number;
  name?: string;
  horizonUrl?: string;
  networkPassphrase?: string;
  friendbotUrl?: string | null;
  isDefault?: boolean;
}): ImportedNetworkProfile {
  const version = input.schemaVersion ?? MIN_SUPPORTED_NETWORK_PROFILE_VERSION;

  if (!Number.isInteger(version)) {
    throw new BadRequestException('Network profile schemaVersion must be an integer.');
  }
  if (version < MIN_SUPPORTED_NETWORK_PROFILE_VERSION || version > NETWORK_PROFILE_SCHEMA_VERSION) {
    throw new BadRequestException(
      `Network profile schema version ${version} is not supported. This build supports versions ${MIN_SUPPORTED_NETWORK_PROFILE_VERSION}–${NETWORK_PROFILE_SCHEMA_VERSION}.`,
    );
  }

  const profile: ImportedNetworkProfile = {
    name: optionalString(input.name) ?? 'Imported Profile',
    horizonUrl: requiredString(input.horizonUrl, 'horizonUrl').replace(/\/+$/, ''),
    networkPassphrase: requiredString(input.networkPassphrase, 'networkPassphrase'),
  };

  const friendbotUrl = optionalString(input.friendbotUrl);
  if (friendbotUrl) profile.friendbotUrl = friendbotUrl;
  if (typeof input.isDefault === 'boolean') profile.isDefault = input.isDefault;

  return profile;
}
