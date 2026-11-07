import { BadRequestException } from '@nestjs/common';
import { Networks } from '@stellar/stellar-sdk';

// Hosted mode requires operator-allowlisted custom endpoints; the check is
// enforced in resolveStellarEndpoints via assertOverrideAllowlisted.

export interface StellarNetworkEndpoints {
  network: string;
  horizonUrl: string;
  friendbotUrl: string;
  rpcUrl: string;
  passphrase: string;
}

export const STANDALONE_PASSPHRASE = 'Standalone Network ; February 2017';

/**
 * Parses a comma-separated allowlist of endpoint origins from an environment
 * variable. Entries are normalized to their origin (scheme://host[:port]).
 */
function parseAllowlist(envValue: string | undefined): string[] {
  if (!envValue) {
    return [];
  }
  return envValue
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .map((entry) => {
      try {
        return new URL(entry).origin;
      } catch {
        throw new BadRequestException(
          `Invalid endpoint in allowlist configuration: ${entry}`,
        );
      }
    });
}

/**
 * Validates that a user-supplied URL is well-formed, uses http(s), and its
 * origin appears in the configured allowlist. Custom endpoints are rejected
 * in hosted mode unless explicitly allowlisted by the operator.
 */
function assertAllowedEndpoint(
  label: string,
  url: string,
  allowlist: string[],
): void {
  let origin: string;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      throw new Error('unsupported protocol');
    }
    origin = parsed.origin;
  } catch {
    throw new BadRequestException(`${label} must be a valid http(s) URL`);
  }

  if (!allowlist.includes(origin)) {
    throw new BadRequestException(
      `${label} is not in the configured allowlist. Operators must explicitly allow this endpoint.`,
    );
  }
}

/**
 * Returns true when the service runs in hosted mode. Hosted mode is the
 * default for safety; set STELLAR_HOSTED_MODE=false to disable enforcement
 * for self-hosted development.
 */
function isHostedMode(): boolean {
  return (process.env.STELLAR_HOSTED_MODE ?? 'true').toLowerCase() !== 'false';
}

/**
 * In hosted mode, custom endpoint overrides require an explicit operator
 * allowlist. If the allowlist for a given endpoint type is empty, every
 * override of that type is rejected.
 */
function assertOverrideAllowlisted(
  label: string,
  url: string | undefined,
  allowlist: string[],
): void {
  if (!url) {
    return;
  }
  if (allowlist.length === 0) {
    throw new BadRequestException(
      `${label} overrides are disabled in hosted mode: no allowlist is configured by the operator.`,
    );
  }
  assertAllowedEndpoint(label, url, allowlist);
}

/**
 * Resolves Horizon, RPC, and Friendbot endpoints from shared configuration
 * and environment variables rather than module constants (Savitura/Savitools#323).
 *
 * Safety invariant: Sandbox operations must never touch mainnet. Any attempt
 * to target mainnet throws BadRequestException immediately before any request
 * is dispatched.
 *
 * Hosted mode: caller-supplied endpoint overrides (horizonUrl, rpcUrl,
 * friendbotUrl) are only accepted when their origin appears in
 * STELLAR_ALLOWED_HORIZON_URLS / STELLAR_ALLOWED_RPC_URLS /
 * STELLAR_ALLOWED_FRIENDBOT_URLS (comma-separated). Otherwise a
 * BadRequestException is thrown. Environment-configured defaults are trusted.
 */
export function resolveStellarEndpoints(
  networkName: string = 'testnet',
  overrides?: {
    horizonUrl?: string;
    friendbotUrl?: string;
    passphrase?: string;
    rpcUrl?: string;
  },
): StellarNetworkEndpoints {
  const normalized = (networkName || 'testnet').toLowerCase().trim();

  // Mainnet is strictly prohibited in Sandbox
  if (normalized === 'mainnet' || normalized === 'public') {
    throw new BadRequestException(
      'Mainnet is prohibited in Sandbox. Sandbox operations are strictly limited to testnet, local quickstart, and private custom networks.',
    );
  }

  const hosted = isHostedMode();
  const allowedHorizon = parseAllowlist(process.env.STELLAR_ALLOWED_HORIZON_URLS);
  const allowedRpc = parseAllowlist(process.env.STELLAR_ALLOWED_RPC_URLS);
  const allowedFriendbot = parseAllowlist(process.env.STELLAR_ALLOWED_FRIENDBOT_URLS);

  if (hosted) {
    assertOverrideAllowlisted('horizonUrl', overrides?.horizonUrl, allowedHorizon);
    assertOverrideAllowlisted('rpcUrl', overrides?.rpcUrl, allowedRpc);
    assertOverrideAllowlisted('friendbotUrl', overrides?.friendbotUrl, allowedFriendbot);
  }

  if (normalized === 'quickstart' || normalized === 'local') {
    return {
      network: 'quickstart',
      horizonUrl:
        overrides?.horizonUrl ||
        process.env.STELLAR_QUICKSTART_HORIZON_URL ||
        'http://localhost:8000',
      friendbotUrl:
        overrides?.friendbotUrl ||
        process.env.STELLAR_QUICKSTART_FRIENDBOT_URL ||
        'http://localhost:8000/friendbot',
      rpcUrl:
        overrides?.rpcUrl ||
        process.env.STELLAR_QUICKSTART_RPC_URL ||
        'http://localhost:8000/soroban/rpc',
      passphrase:
        overrides?.passphrase ||
        process.env.STELLAR_QUICKSTART_PASSPHRASE ||
        STANDALONE_PASSPHRASE,
    };
  }

  if (normalized === 'custom') {
    if (!overrides?.horizonUrl) {
      throw new BadRequestException('Custom network requires a valid horizonUrl');
    }
    if (hosted) {
      assertAllowedEndpoint('horizonUrl', overrides.horizonUrl, allowedHorizon);
    }
    return {
      network: 'custom',
      horizonUrl: overrides.horizonUrl,
      friendbotUrl: overrides.friendbotUrl || '',
      rpcUrl: overrides.rpcUrl || '',
      passphrase: overrides.passphrase || STANDALONE_PASSPHRASE,
    };
  }

  // Default: testnet
  return {
    network: 'testnet',
    horizonUrl:
      overrides?.horizonUrl ||
      process.env.STELLAR_HORIZON_URL ||
      'https://horizon-testnet.stellar.org',
    friendbotUrl:
      overrides?.friendbotUrl ||
      process.env.STELLAR_FRIENDBOT_URL ||
      'https://friendbot.stellar.org',
    rpcUrl:
      overrides?.rpcUrl ||
      process.env.STELLAR_RPC_URL ||
      'https://soroban-rpc-testnet.stellar.org',
    passphrase:
      overrides?.passphrase ||
      process.env.STELLAR_NETWORK_PASSPHRASE ||
      Networks.TESTNET,
  };
}
