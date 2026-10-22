import { BadRequestException } from '@nestjs/common';
import { Keypair } from '@stellar/stellar-sdk';
import { encodeMuxedDestination, parseDestination } from './address';

describe('encodeMuxedDestination', () => {
  it('round-trips the full uint64 range without number coercion', () => {
    const account = Keypair.random().publicKey();
    const muxed = encodeMuxedDestination(account, '18446744073709551615');
    expect(parseDestination(muxed)).toMatchObject({ account, muxedId: '18446744073709551615' });
  });

  it.each(['-1', '18446744073709551616', 'not-a-number'])('rejects invalid ids: %s', (id) => {
    expect(() => encodeMuxedDestination(Keypair.random().publicKey(), id))
      .toThrow(BadRequestException);
  });
});
