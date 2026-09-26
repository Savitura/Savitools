import { BadRequestException } from '@nestjs/common';
import { StrKey } from '@stellar/stellar-sdk';

/**
 * A destination address, normalised.
 *
 * Stellar destinations come in two strkey flavours that a payment can use
 * interchangeably: a plain `G…` account, and an `M…` *muxed* account, which
 * packs a 64-bit payment ID alongside the same underlying `G…` account
 * (CAP-27 / SEP-23). The wire format distinguishes them via the
 * `keyTypeMuxedEd25519` arm of `xdr.MuxedAccount`, so anything that accepts a
 * destination has to accept both rather than pattern-matching on `G`.
 */
export interface ParsedDestination {
  /** The address exactly as the caller supplied it (`G…` or `M…`). */
  input: string;
  /** Whether the address carried a 64-bit muxed payment ID. */
  muxed: boolean;
  /** The underlying `G…` account that actually holds the funds. */
  account: string;
  /** The muxed payment ID as a decimal string, or `null` for a plain account. */
  muxedId: string | null;
}

/** `MED25519` payloads are 32 ed25519 key bytes followed by an 8-byte ID. */
const ED25519_KEY_BYTES = 32;
const MUXED_ID_BYTES = 8;

/**
 * Shape check for a payment destination: a `G…` account (56 chars) or an `M…`
 * muxed account (69 chars), both plain base32. Used by the request DTOs so a
 * malformed address fails validation with a field-level error instead of
 * reaching the Stellar layer, which then verifies the checksum.
 */
export const STELLAR_DESTINATION_PATTERN = /^(G[A-Z2-7]{55}|M[A-Z2-7]{68})$/;

export const STELLAR_DESTINATION_MESSAGE =
  'destination must be a Stellar G… account or M… muxed account';

/**
 * Validate and decode a payment destination.
 *
 * Accepts `G…` and `M…` strkeys and rejects everything else — including
 * checksum-invalid addresses that merely look like a muxed account. Callers
 * that only need validation can ignore the result; callers that want to show
 * the underlying account and payment ID separately use it.
 *
 * @throws BadRequestException with copy the wallet and sandbox pages can show
 *   verbatim.
 */
export function parseDestination(destination: string): ParsedDestination {
  const address = typeof destination === 'string' ? destination.trim() : '';

  if (!address) {
    throw new BadRequestException('Invalid destination public key: empty');
  }

  if (StrKey.isValidEd25519PublicKey(address)) {
    return { input: address, muxed: false, account: address, muxedId: null };
  }

  if (StrKey.isValidMed25519PublicKey(address)) {
    // decodeMed25519PublicKey returns the raw MED25519 payload: the 32-byte
    // ed25519 key followed by the big-endian uint64 ID. Re-encode the key half
    // rather than stripping the leading "M" so the checksum is recomputed
    // rather than assumed.
    const raw = StrKey.decodeMed25519PublicKey(address);
    const account = StrKey.encodeEd25519PublicKey(
      raw.subarray(0, ED25519_KEY_BYTES),
    );
    const muxedId = raw
      .subarray(ED25519_KEY_BYTES, ED25519_KEY_BYTES + MUXED_ID_BYTES)
      .readBigUInt64BE(0)
      .toString();

    return { input: address, muxed: true, account, muxedId };
  }

  // An M-shaped-but-invalid address (bad checksum, truncated, wrong base32
  // alphabet) is worth its own message: "invalid public key" reads like the
  // caller used the wrong field, when the real problem is the muxed payload.
  if (address.startsWith('M')) {
    throw new BadRequestException(
      `Invalid muxed destination address: ${address}`,
    );
  }

  throw new BadRequestException(`Invalid destination public key: ${address}`);
}
