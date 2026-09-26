import { StrKey } from '@stellar/stellar-sdk';
import { accountExplorerUrl, previewDestination } from '@/lib/muxed-address';

function muxedAddress(account: string, id: string): string {
  const payload = Buffer.alloc(40);
  StrKey.decodeEd25519PublicKey(account).copy(payload, 0);
  payload.writeBigUInt64BE(BigInt(id), 32);
  return StrKey.encodeMed25519PublicKey(payload);
}

describe('previewDestination', () => {
  it('reports a plain G… account with no payment id', () => {
    const account = StrKey.encodeEd25519PublicKey(Buffer.alloc(32, 9));

    expect(previewDestination(account)).toEqual({
      kind: 'account',
      account,
      muxedId: null,
    });
  });

  it('splits a muxed address into underlying account and payment id', () => {
    const account = StrKey.encodeEd25519PublicKey(Buffer.alloc(32, 4));
    const muxed = muxedAddress(account, '123456789');

    expect(previewDestination(muxed)).toEqual({
      kind: 'muxed',
      account,
      muxedId: '123456789',
    });
  });

  it('decodes the account and id independently of the SDK MuxedAccount', () => {
    const account = StrKey.encodeEd25519PublicKey(Buffer.alloc(32, 6));
    const muxed = muxedAddress(account, '1');

    const preview = previewDestination(muxed);

    // The account half must itself be a valid G… strkey, not a re-sliced M….
    expect(StrKey.isValidEd25519PublicKey(preview.account ?? '')).toBe(true);
    expect(preview.muxedId).toBe('1');
  });

  it('stays quiet for a partially typed address', () => {
    const account = StrKey.encodeEd25519PublicKey(Buffer.alloc(32, 2));

    expect(previewDestination(account.slice(0, 30))).toEqual({
      kind: null,
      account: null,
      muxedId: null,
    });
  });

  it('stays quiet for a G… address with a corrupted checksum', () => {
    const account = StrKey.encodeEd25519PublicKey(Buffer.alloc(32, 5));
    const corrupted = `${account.slice(0, -1)}${account.endsWith('A') ? 'B' : 'A'}`;

    expect(previewDestination(corrupted).kind).toBeNull();
  });

  it('stays quiet for an empty or whitespace-only value', () => {
    expect(previewDestination('').kind).toBeNull();
    expect(previewDestination('   ').kind).toBeNull();
  });

  it('trims before decoding', () => {
    const account = StrKey.encodeEd25519PublicKey(Buffer.alloc(32, 8));

    expect(previewDestination(` ${account} `).account).toBe(account);
  });
});

describe('accountExplorerUrl', () => {
  it('links to the underlying account on the selected network', () => {
    const account = StrKey.encodeEd25519PublicKey(Buffer.alloc(32, 1));

    expect(accountExplorerUrl(account, 'testnet')).toBe(
      `https://stellar.expert/explorer/testnet/account/${account}`,
    );
    expect(accountExplorerUrl(account, 'mainnet')).toBe(
      `https://stellar.expert/explorer/mainnet/account/${account}`,
    );
  });
});
