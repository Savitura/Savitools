import { StrKey } from '@stellar/stellar-sdk';

/**
 * What a destination input resolves to, for display.
 *
 * A Stellar payment destination is either a plain `G…` account or an `M…`
 * muxed account that packs a 64-bit payment ID alongside the same underlying
 * `G…` account (CAP-27 / SEP-23). The two halves are worth showing separately:
 * the account is what a block explorer links to, and the ID is what the
 * receiving service uses to route the payment.
 */
export interface DestinationPreview {
  /** Which kind of address was entered, or `null` when it is neither. */
  kind: 'account' | 'muxed' | null;
  /** The underlying `G…` account, when the input decoded. */
  account: string | null;
  /** The muxed payment ID as a decimal string, when the input is muxed. */
  muxedId: string | null;
}

const MED25519_KEY_BYTES = 32;
const MED25519_ID_BYTES = 8;

/**
 * Decode a destination string for display, without throwing.
 *
 * Returns `kind: null` for anything that is not a valid `G…` or `M…` strkey,
 * so callers can render an inline hint instead of an error. A partial or
 * mistyped address therefore stays unremarked until the user submits.
 */
export function previewDestination(value: string): DestinationPreview {
  const address = value.trim();

  if (StrKey.isValidEd25519PublicKey(address)) {
    return { kind: 'account', account: address, muxedId: null };
  }

  if (StrKey.isValidMed25519PublicKey(address)) {
    const raw = StrKey.decodeMed25519PublicKey(address);

    return {
      kind: 'muxed',
      account: StrKey.encodeEd25519PublicKey(
        raw.subarray(0, MED25519_KEY_BYTES),
      ),
      muxedId: raw
        .subarray(
          MED25519_KEY_BYTES,
          MED25519_KEY_BYTES + MED25519_ID_BYTES,
        )
        .readBigUInt64BE(0)
        .toString(),
    };
  }

  return { kind: null, account: null, muxedId: null };
}

/** Stellar Expert's account page, which takes the underlying G… account. */
export function accountExplorerUrl(
  account: string,
  network: 'testnet' | 'mainnet',
): string {
  return `https://stellar.expert/explorer/${network}/account/${account}`;
}
