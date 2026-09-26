import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { Keypair, StrKey } from '@stellar/stellar-sdk';
import {
  STELLAR_DESTINATION_MESSAGE,
} from '../../stellar/address';
import { PaymentDto } from './payment.dto';

function muxedAddress(account: string, id: string): string {
  const payload = Buffer.alloc(40);
  StrKey.decodeEd25519PublicKey(account).copy(payload, 0);
  payload.writeBigUInt64BE(BigInt(id), 32);
  return StrKey.encodeMed25519PublicKey(payload);
}

function validateDestination(toPublicKey: string): string[] {
  const dto = plainToInstance(PaymentDto, {
    fromSecret: Keypair.random().secret(),
    toPublicKey,
    asset: 'XLM',
    amount: '10',
  });

  return validateSync(dto)
    .filter((error) => error.property === 'toPublicKey')
    .flatMap((error) => Object.values(error.constraints ?? {}));
}

describe('PaymentDto destination validation', () => {
  it('accepts a G… account', () => {
    expect(validateDestination(Keypair.random().publicKey())).toEqual([]);
  });

  it('accepts an M… muxed account', () => {
    const muxed = muxedAddress(Keypair.random().publicKey(), '42');

    expect(validateDestination(muxed)).toEqual([]);
  });

  it('rejects a truncated address with a field-level message', () => {
    expect(
      validateDestination(Keypair.random().publicKey().slice(0, 55)),
    ).toEqual([STELLAR_DESTINATION_MESSAGE]);
  });

  it('rejects a muxed address of the wrong length', () => {
    const muxed = muxedAddress(Keypair.random().publicKey(), '42');

    expect(validateDestination(muxed.slice(0, -1))).toEqual([
      STELLAR_DESTINATION_MESSAGE,
    ]);
  });

  it('rejects a contract id', () => {
    const contract = StrKey.encodeContract(Buffer.alloc(32, 1));

    expect(validateDestination(contract)).toEqual([
      STELLAR_DESTINATION_MESSAGE,
    ]);
  });

  it('rejects lowercase base32', () => {
    expect(
      validateDestination(Keypair.random().publicKey().toLowerCase()),
    ).toEqual([STELLAR_DESTINATION_MESSAGE]);
  });

  it('rejects an address with the wrong prefix', () => {
    const account = Keypair.random().publicKey();

    expect(validateDestination(`X${account.slice(1)}`)).toEqual([
      STELLAR_DESTINATION_MESSAGE,
    ]);
  });

  it('rejects an empty address', () => {
    // Both @IsNotEmpty and @Matches fire here; the destination message is the
    // one that names the field for the caller.
    expect(validateDestination('')).toContain(STELLAR_DESTINATION_MESSAGE);
  });
});
