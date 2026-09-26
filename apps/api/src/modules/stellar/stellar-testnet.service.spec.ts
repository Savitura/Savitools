import { BadRequestException } from '@nestjs/common';
import {
  Account,
  Keypair,
  MuxedAccount,
  Networks,
  StrKey,
  Transaction,
  TransactionBuilder,
} from '@stellar/stellar-sdk';
import { StellarTestnetService } from './stellar-testnet.service';

/**
 * Build an M… address for `account` carrying `id`.
 *
 * The SDK has no single "encode muxed address" helper, so this mirrors what
 * `MuxedAccount` does internally: a MED25519 payload is the 32-byte ed25519
 * key followed by the big-endian uint64 payment ID.
 */
function muxedAddress(account: string, id: string): string {
  const payload = Buffer.alloc(40);
  StrKey.decodeEd25519PublicKey(account).copy(payload, 0);
  payload.writeBigUInt64BE(BigInt(id), 32);
  return StrKey.encodeMed25519PublicKey(payload);
}

describe('StellarTestnetService', () => {
  let service: StellarTestnetService;

  beforeEach(() => {
    service = new StellarTestnetService();
  });

  describe('generateKeypair', () => {
    it('returns a valid Stellar keypair', () => {
      const keypair = service.generateKeypair();

      expect(keypair.publicKey).toMatch(/^G[A-Z0-9]{55}$/);
      expect(keypair.secretKey).toMatch(/^S[A-Z0-9]{55}$/);
    });

    it('public key corresponds to secret key', () => {
      const keypair = service.generateKeypair();

      expect(Keypair.fromSecret(keypair.secretKey).publicKey()).toBe(
        keypair.publicKey,
      );
    });

    it('zeros the raw secret buffer after reading the string secret', () => {
      const originalRandom = Keypair.random;
      const raw = Buffer.alloc(32, 1);

      Keypair.random = () => {
        const keypair = originalRandom.call(Keypair);
        keypair.rawSecretKey = () => raw;
        return keypair;
      };

      try {
        service.generateKeypair();
      } finally {
        Keypair.random = originalRandom;
      }

      expect([...raw]).toEqual(new Array(raw.length).fill(0));
    });
  });

  describe('parseAsset', () => {
    it('treats XLM as the native asset', () => {
      expect(service.parseAsset('XLM').isNative()).toBe(true);
    });

    it('reads CODE:ISSUER as a credit asset', () => {
      const issuer = Keypair.random().publicKey();
      const asset = service.parseAsset(`USDC:${issuer}`);

      expect(asset.getCode()).toBe('USDC');
      expect(asset.getIssuer()).toBe(issuer);
    });

    it('rejects a malformed asset with the shared copy', () => {
      expect(() => service.parseAsset('INVALID_FORMAT')).toThrow(
        'Invalid asset format: "INVALID_FORMAT". Use "XLM" or "CODE:ISSUER"',
      );
    });

    it('rejects a half-specified credit asset', () => {
      expect(() => service.parseAsset('USDC:')).toThrow(BadRequestException);
    });
  });

  describe('assertPositiveAmount', () => {
    it('accepts a positive amount', () => {
      expect(() => service.assertPositiveAmount('10')).not.toThrow();
    });

    it.each(['0', '-5', 'abc', ''])('rejects %p', (amount) => {
      expect(() => service.assertPositiveAmount(amount)).toThrow(
        'Amount must be a positive number',
      );
    });
  });

  describe('assertDestination', () => {
    it('accepts a full public key', () => {
      expect(() =>
        service.assertDestination(Keypair.random().publicKey()),
      ).not.toThrow();
    });

    it('returns the plain account for a G… destination', () => {
      const account = Keypair.random().publicKey();

      expect(service.assertDestination(account)).toEqual({
        input: account,
        muxed: false,
        account,
        muxedId: null,
      });
    });

    it('accepts a muxed destination and reports the underlying account', () => {
      const account = Keypair.random().publicKey();
      const muxed = muxedAddress(account, '12345');

      expect(service.assertDestination(muxed)).toEqual({
        input: muxed,
        muxed: true,
        account,
        muxedId: '12345',
      });
    });

    it('rejects an M… address whose checksum does not match', () => {
      const muxed = muxedAddress(Keypair.random().publicKey(), '1');
      const corrupted = `${muxed.slice(0, -1)}${muxed.endsWith('A') ? 'B' : 'A'}`;

      expect(() => service.assertDestination(corrupted)).toThrow(
        `Invalid muxed destination address: ${corrupted}`,
      );
    });

    it('rejects a short destination', () => {
      expect(() => service.assertDestination('short')).toThrow(
        'Invalid destination public key',
      );
    });

    it('rejects a contract id as a payment destination', () => {
      const contract = StrKey.encodeContract(Buffer.alloc(32, 7));

      expect(() => service.assertDestination(contract)).toThrow(
        'Invalid destination public key',
      );
    });
  });

  describe('keypairFromSecret', () => {
    it('rejects an unparsable secret', () => {
      expect(() => service.keypairFromSecret('INVALID')).toThrow(
        'Invalid source secret key',
      );
    });

    it('round-trips a generated secret', () => {
      const generated = service.generateKeypair();
      expect(service.keypairFromSecret(generated.secretKey).publicKey()).toBe(
        generated.publicKey,
      );
    });
  });

  describe('mapBalances', () => {
    it('maps Horizon balance fields and drops a missing limit', () => {
      const balances = service.mapBalances({
        balances: [
          { asset_type: 'native', balance: '10.0000000' },
          {
            asset_type: 'credit_alphanum4',
            asset_code: 'USDC',
            asset_issuer: 'GISSUER',
            balance: '5.0000000',
            limit: '100.0000000',
          },
        ],
      });

      expect(balances).toEqual([
        {
          assetType: 'native',
          assetCode: null,
          assetIssuer: null,
          balance: '10.0000000',
          limit: undefined,
        },
        {
          assetType: 'credit_alphanum4',
          assetCode: 'USDC',
          assetIssuer: 'GISSUER',
          balance: '5.0000000',
          limit: '100.0000000',
        },
      ]);
    });

    it('returns an empty list when Horizon omits balances', () => {
      expect(service.mapBalances({ balances: [] })).toEqual([]);
    });
  });

  describe('startingBalanceOf', () => {
    it('reports the native balance when present', () => {
      expect(
        service.startingBalanceOf({
          balances: [{ asset_type: 'native', balance: '10000.0000000' }],
        }),
      ).toBe('10000.0000000 XLM');
    });

    it('falls back to the standard Friendbot amount', () => {
      expect(service.startingBalanceOf({ balances: [] })).toBe('10,000 XLM');
    });
  });

  describe('requestFriendbotFunding', () => {
    it('returns the transaction hash on success', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ hash: 'tx-hash-123' }),
      });

      await expect(service.requestFriendbotFunding('GTEST')).resolves.toEqual({
        ok: true,
        hash: 'tx-hash-123',
      });
    });

    it('reports a missing hash as null', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({}),
      });

      await expect(service.requestFriendbotFunding('GTEST')).resolves.toEqual({
        ok: true,
        hash: null,
      });
    });

    it('returns the HTTP failure instead of throwing', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: async () => 'Server Error',
      });

      await expect(service.requestFriendbotFunding('GTEST')).resolves.toEqual({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        body: 'Server Error',
      });
    });

    it('throws when the request cannot be made at all', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('Timeout'));

      await expect(service.requestFriendbotFunding('GTEST')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('isAlreadyFundedReply', () => {
    it('detects the friendbot copy', () => {
      expect(
        service.isAlreadyFundedReply({
          ok: false,
          status: 400,
          statusText: 'Bad Request',
          body: 'account already funded',
        }),
      ).toBe(true);
    });

    it('treats a bare 400 as already funded', () => {
      expect(
        service.isAlreadyFundedReply({
          ok: false,
          status: 400,
          statusText: 'Bad Request',
          body: '',
        }),
      ).toBe(true);
    });

    it('does not treat a server error as already funded', () => {
      expect(
        service.isAlreadyFundedReply({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
          body: 'Server Error',
        }),
      ).toBe(false);
    });
  });

  describe('friendbotFailure', () => {
    it('carries the status and body into the message', () => {
      const error = service.friendbotFailure({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        body: 'Invalid address',
      });

      expect(error).toBeInstanceOf(BadRequestException);
      expect(error.message).toBe(
        'Friendbot funding failed (400): Invalid address',
      );
    });

    it('falls back to the status text for an empty body', () => {
      const error = service.friendbotFailure({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
        body: '',
      });

      expect(error.message).toBe(
        'Friendbot funding failed (503): Service Unavailable',
      );
    });
  });

  describe('loadAccount', () => {
    it('maps a missing account onto the funding hint', async () => {
      jest
        .spyOn(service.server, 'loadAccount')
        .mockRejectedValueOnce(new Error('Account not found'));

      await expect(service.loadAccount('GTEST')).rejects.toThrow(
        'Account GTEST not found on testnet. Fund it via Friendbot first.',
      );
    });

    it('keeps the underlying message for any other failure', async () => {
      jest
        .spyOn(service.server, 'loadAccount')
        .mockRejectedValueOnce(new Error('gateway timeout'));

      await expect(service.loadAccount('GTEST')).rejects.toThrow(
        'Failed to load account: gateway timeout',
      );
    });
  });

  describe('loadAccountIfPresent', () => {
    it('returns null instead of throwing', async () => {
      jest
        .spyOn(service.server, 'loadAccount')
        .mockRejectedValueOnce(new Error('not found'));

      await expect(service.loadAccountIfPresent('GTEST')).resolves.toBeNull();
    });

    it('returns the account when it exists', async () => {
      const account = { sequence: '1', balances: [], signers: [], thresholds: {}, flags: {} };
      jest
        .spyOn(service.server, 'loadAccount')
        .mockResolvedValueOnce(account as never);

      await expect(service.loadAccountIfPresent('GTEST')).resolves.toBe(account);
    });
  });

  describe('buildPaymentOperation', () => {
    /**
     * `Operation.payment`'s declared return type is a union of every operation
     * class, none of which expose `body()` in the generated typings. Narrowing
     * through the XDR accessor is the point of these assertions, so read the
     * arm through a minimal structural type.
     */
    const xdrBody = (operation: unknown) =>
      (
        operation as {
          body: () => { value: () => { destination: () => MuxedDestination } };
        }
      )
        .body()
        .value()
        .destination();

    type MuxedDestination = {
      switch: () => { name: string };
      med25519: () => { ed25519: () => Buffer; id: () => { toString: () => string } };
      ed25519: () => Buffer;
    };

    it('keeps a muxed destination in the muxed arm with its payment ID', () => {
      const account = Keypair.random().publicKey();
      const muxed = muxedAddress(account, '4294967297');

      const destination = xdrBody(
        service.buildPaymentOperation({
          sourceSecret: 'unused',
          destination: muxed,
          asset: 'XLM',
          amount: '10',
        }),
      );

      expect(destination.switch().name).toBe('keyTypeMuxedEd25519');

      const med25519 = destination.med25519();
      expect(StrKey.encodeEd25519PublicKey(med25519.ed25519())).toBe(account);
      expect(med25519.id().toString()).toBe('4294967297');
    });

    it('keeps a plain G destination in the ed25519 arm', () => {
      const account = Keypair.random().publicKey();

      const destination = xdrBody(
        service.buildPaymentOperation({
          sourceSecret: 'unused',
          destination: account,
          asset: 'XLM',
          amount: '10',
        }),
      );

      expect(destination.switch().name).toBe('keyTypeEd25519');
      expect(StrKey.encodeEd25519PublicKey(destination.ed25519())).toBe(account);
    });

    it('survives a full XDR round trip', () => {
      const source = Keypair.random();
      const account = Keypair.random().publicKey();
      const muxed = muxedAddress(account, '7');
      const builder = new TransactionBuilder(
        new Account(source.publicKey(), '100'),
        { fee: '100', networkPassphrase: Networks.TESTNET },
      ).addOperation(
        service.buildPaymentOperation({
          sourceSecret: source.secret(),
          destination: muxed,
          asset: 'XLM',
          amount: '10',
        }),
      );
      const roundTripped = new Transaction(
        builder.setTimeout(30).build().toXDR(),
        Networks.TESTNET,
      );

      // Decoding the envelope hands back the destination as a strkey, so the
      // payment ID has to survive the encode/decode cycle to come out muxed.
      const decoded = roundTripped.operations[0] as unknown as {
        type: string;
        destination: string;
        amount: string;
      };
      expect(decoded.type).toBe('payment');
      expect(Number(decoded.amount)).toBe(10);
      expect(decoded.destination).toBe(muxed);
      expect(StrKey.isValidMed25519PublicKey(decoded.destination)).toBe(true);

      const muxedAccount = MuxedAccount.fromAddress(decoded.destination, '0');
      expect(muxedAccount.baseAccount().accountId()).toBe(account);
      expect(muxedAccount.id()).toBe('7');
    });
  });

  describe('submitPayment', () => {
    const source = Keypair.random();
    const destination = Keypair.random().publicKey();

    it('submits a signed payment and returns Horizon\'s result', async () => {
      jest
        .spyOn(service.server, 'loadAccount')
        .mockResolvedValueOnce(new Account(source.publicKey(), '100') as never);
      const submitted = {
        hash: 'tx-hash-123',
        fee_charged: '100',
        result_codes: { operation_results: [['op_success']] },
      };
      const submit = jest
        .spyOn(service.server, 'submitTransaction')
        .mockResolvedValueOnce(submitted as never);

      await expect(
        service.submitPayment({
          sourceSecret: source.secret(),
          destination,
          asset: 'XLM',
          amount: '10',
        }),
      ).resolves.toBe(submitted);

      expect(submit).toHaveBeenCalledTimes(1);
    });

    it('validates before touching the network', async () => {
      const load = jest.spyOn(service.server, 'loadAccount');

      await expect(
        service.submitPayment({
          sourceSecret: 'INVALID',
          destination,
          asset: 'XLM',
          amount: '10',
        }),
      ).rejects.toThrow('Invalid source secret key');

      await expect(
        service.submitPayment({
          sourceSecret: source.secret(),
          destination: 'short',
          asset: 'XLM',
          amount: '10',
        }),
      ).rejects.toThrow('Invalid destination public key');

      await expect(
        service.submitPayment({
          sourceSecret: source.secret(),
          destination,
          asset: 'XLM',
          amount: '0',
        }),
      ).rejects.toThrow('Amount must be a positive number');

      await expect(
        service.submitPayment({
          sourceSecret: source.secret(),
          destination,
          asset: 'INVALID_FORMAT',
          amount: '10',
        }),
      ).rejects.toThrow('Invalid asset format');

      expect(load).not.toHaveBeenCalled();
    });

    it('wraps a Horizon submission failure', async () => {
      jest
        .spyOn(service.server, 'loadAccount')
        .mockResolvedValueOnce(new Account(source.publicKey(), '100') as never);
      jest
        .spyOn(service.server, 'submitTransaction')
        .mockRejectedValueOnce(new Error('tx_bad_seq'));

      await expect(
        service.submitPayment({
          sourceSecret: source.secret(),
          destination,
          asset: 'XLM',
          amount: '10',
        }),
      ).rejects.toThrow('Payment failed: tx_bad_seq');
    });
  });
});
