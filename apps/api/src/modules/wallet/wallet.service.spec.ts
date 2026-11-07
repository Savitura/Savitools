import { WalletService } from './wallet.service';
import { BadRequestException } from '@nestjs/common';
import {
  Account,
  Asset,
  BASE_FEE,
  Keypair,
  Networks,
  Operation,
  TransactionBuilder,
} from '@stellar/stellar-sdk';

function buildSignedPaymentXdr(source: Keypair, destination: string): string {
  const transaction = new TransactionBuilder(
    new Account(source.publicKey(), '0'),
    { fee: BASE_FEE, networkPassphrase: Networks.TESTNET },
  )
    .addOperation(
      Operation.payment({ destination, asset: Asset.native(), amount: '10' }),
    )
    .setTimeout(30)
    .build();
  transaction.sign(source);
  return transaction.toEnvelope().toXDR('base64');
}

describe('WalletService', () => {
  let service: WalletService;

  beforeEach(() => {
    service = new WalletService();
  });

  describe('generateKeypair', () => {
    it('returns a valid Stellar keypair', () => {
      const keypair = service.generateKeypair();

      expect(keypair.publicKey).toMatch(/^G[A-Z0-9]{55}$/);
      expect(keypair.secretKey).toMatch(/^S[A-Z0-9]{55}$/);
    });

    it('generates unique keypairs each call', () => {
      const kp1 = service.generateKeypair();
      const kp2 = service.generateKeypair();

      expect(kp1.publicKey).not.toBe(kp2.publicKey);
    });

    it('public key corresponds to secret key', () => {
      const keypair = service.generateKeypair();

      const reconstructed = Keypair.fromSecret(keypair.secretKey);
      expect(reconstructed.publicKey()).toBe(keypair.publicKey);
    });

    it('zeros raw secret key buffer on keypair generation', () => {
      const originalRandom = Keypair.random;
      const raw = Buffer.alloc(32, 1);

      Keypair.random = () => {
        const kp = originalRandom.call(Keypair);
        kp.rawSecretKey = () => raw;
        return kp;
      };

      try {
        service.generateKeypair();
      } finally {
        Keypair.random = originalRandom;
      }

      expect([...raw]).toEqual(new Array(raw.length).fill(0));
    });
  });

  describe('fundFromFriendbot', () => {
    it('returns funding details on success', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ hash: 'tx-hash-123' }),
      });

      const result = await service.fundFromFriendbot('GTEST');

      expect(result.publicKey).toBe('GTEST');
      expect(result.funded).toBe(true);
      expect(result.txHash).toBe('tx-hash-123');
    });

    it('throws on fetch failure', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('Timeout'));

      await expect(service.fundFromFriendbot('GTEST')).rejects.toThrow(BadRequestException);
    });

    it('throws on non-ok response', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        text: async () => 'Invalid address',
      });

      await expect(service.fundFromFriendbot('GTEST')).rejects.toThrow(BadRequestException);
    });
  });

  describe('sendPayment', () => {
    it('rejects a malformed signed XDR before touching the network', async () => {
      await expect(service.sendPayment('INVALID')).rejects.toThrow(
        'Invalid signed transaction XDR',
      );
    });

    it('rejects an unsigned transaction envelope', async () => {
      const source = Keypair.random();
      const destination = Keypair.random().publicKey();
      const unsigned = new TransactionBuilder(
        new Account(source.publicKey(), '0'),
        { fee: BASE_FEE, networkPassphrase: Networks.TESTNET },
      )
        .addOperation(
          Operation.payment({ destination, asset: Asset.native(), amount: '10' }),
        )
        .setTimeout(30)
        .build()
        .toEnvelope()
        .toXDR('base64');

      await expect(service.sendPayment(unsigned)).rejects.toThrow(
        'at least one signature',
      );
    });

    it("submits a client-signed payment and returns Horizon's hash", async () => {
      const source = Keypair.random();
      const destination = Keypair.random().publicKey();
      const signedXdr = buildSignedPaymentXdr(source, destination);

      const submit = jest
        .spyOn((service as any).stellar, 'submitSignedTransaction')
        .mockResolvedValue({ hash: 'tx-hash-1' });

      await expect(service.sendPayment(signedXdr)).resolves.toEqual({
        success: true,
        txHash: 'tx-hash-1',
      });
      expect(submit).toHaveBeenCalledTimes(1);
    });
  });
});
