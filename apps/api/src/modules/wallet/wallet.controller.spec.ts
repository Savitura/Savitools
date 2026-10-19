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
import { Test, TestingModule } from '@nestjs/testing';
import { WalletController } from './wallet.controller';
import { WalletService } from './wallet.service';
import { AssetControlService } from './assetcontrol.service';
import { StellarTestnetService } from '../stellar/stellar-testnet.service';
import { BalancesDto } from './dto/balances.dto';
import { SendPaymentDto } from './dto/send-payment.dto';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ThrottlerGuard } from '@nestjs/throttler';

/** Build and sign a payment envelope so the controller receives a real XDR. */
function buildSignedPaymentXdr(source: Keypair, destination: string): string {
  const transaction = new TransactionBuilder(
    new Account(source.publicKey(), '0'),
    { fee: BASE_FEE, networkPassphrase: Networks.TESTNET },
  )
    .addOperation(
      Operation.payment({
        destination,
        asset: Asset.native(),
        amount: '10',
      }),
    )
    .setTimeout(30)
    .build();
  transaction.sign(source);
  return transaction.toEnvelope().toXDR('base64');
}

describe('WalletController', () => {
  let controller: WalletController;
  let walletService: WalletService;
  let assetControlService: AssetControlService;
  let stellarTestnetService: StellarTestnetService;

  beforeEach(() => {
    stellarTestnetService = new StellarTestnetService();
    walletService = new WalletService(stellarTestnetService);
    assetControlService = new AssetControlService(stellarTestnetService);
    controller = new WalletController(walletService, assetControlService);
  });

  describe('generate', () => {
    it('returns a valid Stellar keypair from real WalletService', () => {
      const result = controller.generate();
      expect(result).toBeDefined();
      expect(result.publicKey).toMatch(/^G[A-Z0-9]{55}$/);
      expect(result.secretKey).toMatch(/^S[A-Z0-9]{55}$/);

      const reconstructed = Keypair.fromSecret(result.secretKey);
      expect(reconstructed.publicKey()).toBe(result.publicKey);
    });
  });

  describe('fund', () => {
    it('delegates to real WalletService and returns funding response', async () => {
      const mockPublicKey = Keypair.random().publicKey();
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ hash: 'test-tx-hash-456' }),
      });

      const result = await controller.fund({ publicKey: mockPublicKey });
      expect(result).toEqual({
        publicKey: mockPublicKey,
        funded: true,
        txHash: 'test-tx-hash-456',
        startingBalance: '10,000 XLM',
      });
    });

    it('propagates BadRequestException when Friendbot returns an error', async () => {
      const mockPublicKey = Keypair.random().publicKey();
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: async () => 'Friendbot overloaded',
      });

      await expect(controller.fund({ publicKey: mockPublicKey })).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('getBalances', () => {
    it('delegates to real WalletService and returns formatted balances', async () => {
      const mockPublicKey = Keypair.random().publicKey();
      jest.spyOn(stellarTestnetService, 'loadAccount').mockResolvedValue({
        account_id: mockPublicKey,
        sequence: '1',
        balances: [
          {
            asset_type: 'native',
            balance: '100.0000000',
          },
          {
            asset_type: 'credit_alphanum4',
            asset_code: 'TEST',
            asset_issuer: Keypair.random().publicKey(),
            balance: '50.0000000',
            limit: '1000.0000000',
          },
        ],
      } as any);

      const result = await controller.getBalances({ publicKey: mockPublicKey } as any);
      expect(result.publicKey).toBe(mockPublicKey);
      expect(result.balances).toEqual([
        {
          assetType: 'native',
          assetCode: null,
          assetIssuer: null,
          balance: '100.0000000',
          limit: undefined,
        },
        {
          assetType: 'credit_alphanum4',
          assetCode: 'TEST',
          assetIssuer: expect.any(String),
          balance: '50.0000000',
          limit: '1000.0000000',
        },
      ]);
    });
  });

  describe('sendPayment', () => {
    it('rejects a malformed signed XDR through the real service', async () => {
      await expect(
        controller.sendPayment({ signedXdr: 'NOT_A_SIGNED_XDR' }),
      ).rejects.toThrow('Invalid signed transaction XDR');
    });

    it('submits a client-signed payment and returns the transaction hash', async () => {
      const source = Keypair.random();
      const destination = Keypair.random().publicKey();
      const signedXdr = buildSignedPaymentXdr(source, destination);

      jest.spyOn(stellarTestnetService, 'submitSignedTransaction').mockResolvedValue({
        hash: 'tx-hash-789',
      });

      const result = await controller.sendPayment({ signedXdr });

      expect(result).toEqual({
        success: true,
        txHash: 'tx-hash-789',
      });
    });
  });

  describe('asset control endpoints', () => {
    it('getAssetFlags delegates to AssetControlService', async () => {
      const code = 'TEST';
      const issuer = Keypair.random().publicKey();
      jest.spyOn(assetControlService, 'getAssetFlags').mockResolvedValue({
        asset: { code, issuer },
        account: issuer,
        authorizationRequired: true,
        authorizationRevocable: false,
        authorizationImmutable: false,
        authorizationClawbackEnabled: true,
      });

      const result = await controller.getAssetFlags(code, issuer);
      expect(result.asset.code).toBe(code);
      expect(result.authorizationRequired).toBe(true);
    });

    it('getAssetTrustlines parses filters and delegates to AssetControlService', async () => {
      const code = 'TEST';
      const issuer = Keypair.random().publicKey();
      jest.spyOn(assetControlService, 'getTrustlines').mockResolvedValue({
        asset: { code, issuer },
        total: 1,
        fetched: 1,
        pages: 1,
        truncated: false,
        trustlines: [],
      });

      const result = await controller.getAssetTrustlines(
        code,
        issuer,
        'true',
        'false',
        '10',
        '100',
        'GACCOUNT',
      );
      expect(assetControlService.getTrustlines).toHaveBeenCalledWith(code, issuer, {
        authorized: true,
        clawbackEnabled: false,
        minBalance: 10,
        maxBalance: 100,
        account: 'GACCOUNT',
      });
      expect(result.total).toBe(1);
    });

    it('throws BadRequestException for invalid boolean filter', () => {
      const code = 'TEST';
      const issuer = Keypair.random().publicKey();

      expect(() =>
        controller.getAssetTrustlines(code, issuer, 'not-a-boolean'),
      ).toThrow(BadRequestException);
    });

    it('throws BadRequestException for invalid number filter', () => {
      const code = 'TEST';
      const issuer = Keypair.random().publicKey();

      expect(() =>
        controller.getAssetTrustlines(
          code,
          issuer,
          undefined,
          undefined,
          'not-a-number',
        ),
      ).toThrow(BadRequestException);
    });
  });
});

describe('WalletController validation and auth guards', () => {
  let _controller: WalletController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WalletController],
      providers: [
        {
          provide: WalletService,
          useValue: {
            generateKeypair: jest.fn(),
            fundFromFriendbot: jest.fn(),
            getBalances: jest.fn(),
            sendPayment: jest.fn(),
          },
        },
        {
          provide: AssetControlService,
          useValue: {},
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();

    _controller = module.get<WalletController>(WalletController);
  });

  describe('BalancesDto validation', () => {
    it('accepts valid G... stellar public key', async () => {
      const dto = plainToInstance(BalancesDto, {
        publicKey: 'GBZR7WLLV5OZVUQ4WAWCKVCOVWGZFZVHG5GMRFYVZJZ2AFSGHFKDQ4C',
      });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('rejects invalid stellar public key', async () => {
      const dto = plainToInstance(BalancesDto, {
        publicKey: 'INVALIDKEY',
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('SendPaymentDto validation', () => {
    it('accepts a base64 signed XDR', async () => {
      const dto = plainToInstance(SendPaymentDto, {
        signedXdr: 'AAAAAgAAAAA=',
      });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('rejects a non-base64 signed XDR', async () => {
      const dto = plainToInstance(SendPaymentDto, {
        signedXdr: 'NOT A SIGNED XDR',
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });
});
