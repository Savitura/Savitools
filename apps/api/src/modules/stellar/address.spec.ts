import { BadRequestException } from '@nestjs/common';
import { Keypair, MuxedAccount, StrKey } from '@stellar/stellar-sdk';
import { parseDestination } from './address';

function muxedAddress(account: string, id: string): string {
  const payload = Buffer.alloc(40);
  StrKey.decodeEd25519PublicKey(account).copy(payload, 0);
  payload.writeBigUInt64BE(BigInt(id), 32);
  return StrKey.encodeMed25519PublicKey(payload);
}

describe('parseDestination', () => {
  describe('plain G… accounts', () => {
    it('round-trips the address and reports no muxed id', () => {
      const account = Keypair.random().publicKey();

      expect(parseDestination(account)).toEqual({
        input: account,
        muxed: false,
        account,
        muxedId: null,
      });
    });

    it('trims surrounding whitespace before validating', () => {
      const account = Keypair.random().publicKey();

      expect(parseDestination(`  ${account}  `).account).toBe(account);
    });
  });

  describe('M… muxed accounts', () => {
    it('decodes the underlying account and payment id', () => {
      const account = Keypair.random().publicKey();
      const muxed = muxedAddress(account, '12345');

      expect(parseDestination(muxed)).toEqual({
        input: muxed,
        muxed: true,
        account,
        muxedId: '12345',
      });
    });

    it('agrees with the SDK\u2019s own MuxedAccount decoding', () => {
      const account = Keypair.random().publicKey();
      const muxed = muxedAddress(account, '9007199254740993');

      const ours = parseDestination(muxed);
      const sdk = MuxedAccount.fromAddress(muxed, '0');

      expect(ours.account).toBe(sdk.baseAccount().accountId());
      expect(ours.muxedId).toBe(sdk.id());
    });

    it('accepts a zero payment id', () => {
      const account = Keypair.random().publicKey();

      expect(parseDestination(muxedAddress(account, '0')).muxedId).toBe('0');
    });

    it('accepts the maximum uint64 payment id', () => {
      const account = Keypair.random().publicKey();
      const max = '18446744073709551615';

      expect(parseDestination(muxedAddress(account, max)).muxedId).toBe(max);
    });

    it('rejects an M… address whose checksum does not match', () => {
      const muxed = muxedAddress(Keypair.random().publicKey(), '5');
      const corrupted = `${muxed.slice(0, -1)}${muxed.endsWith('A') ? 'B' : 'A'}`;

      expect(() => parseDestination(corrupted)).toThrow(BadRequestException);
      expect(() => parseDestination(corrupted)).toThrow(
        `Invalid muxed destination address: ${corrupted}`,
      );
    });

    it('rejects a truncated M… address as a muxed error, not a G error', () => {
      const truncated = muxedAddress(Keypair.random().publicKey(), '5').slice(
        0,
        68,
      );

      expect(() => parseDestination(truncated)).toThrow(
        'Invalid muxed destination address',
      );
    });

    it('rejects an M… string containing characters outside base32', () => {
      const invalid = `M${'0'.repeat(68)}`;

      expect(() => parseDestination(invalid)).toThrow(
        'Invalid muxed destination address',
      );
    });
  });

  describe('other address kinds', () => {
    it('rejects a contract id', () => {
      const contract = StrKey.encodeContract(Buffer.alloc(32, 3));

      expect(() => parseDestination(contract)).toThrow(
        'Invalid destination public key',
      );
    });

    it('rejects a secret key', () => {
      const secret = Keypair.random().secret();

      expect(() => parseDestination(secret)).toThrow(
        'Invalid destination public key',
      );
    });

    it('rejects an empty string', () => {
      expect(() => parseDestination('')).toThrow(
        'Invalid destination public key',
      );
    });

    it('rejects a whitespace-only string', () => {
      expect(() => parseDestination('   ')).toThrow(
        'Invalid destination public key: empty',
      );
    });
  });
});
