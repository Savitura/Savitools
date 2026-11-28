import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ChallengeRequestDto } from './dto/challenge-request.dto';
import { SignChallengeDto } from './dto/sign-challenge.dto';
import { TokenExchangeDto } from './dto/token-exchange.dto';
import { ValidateChallengeDto } from './dto/validate-challenge.dto';
import { Sep10DebuggerController } from './sep10-debugger.controller';
import {
  ChallengeDetails,
  HttpDiagnostics,
  Sep10DebuggerService,
  ValidationCheck,
} from './sep10-debugger.service';

type MockSep10Service = jest.Mocked<
  Pick<
    Sep10DebuggerService,
    'fetchChallenge' | 'validateChallenge' | 'signChallenge' | 'exchangeToken'
  >
>;

describe('Sep10DebuggerController', () => {
  let controller: Sep10DebuggerController;
  let service: MockSep10Service;
  let module: TestingModule;

  // Opaque fixtures: transaction parsing, signing and redaction belong to the
  // service tests. These tests exercise only the controller's delegation.
  const challenge: ChallengeDetails = {
    xdr: 'challenge-xdr',
    hash: 'challenge-hash',
    networkPassphrase: 'Test SDF Network ; September 2015',
    sourceAccount: 'server-public-key',
    sequenceNumber: '0',
    fee: '100',
    operations: [],
    signatures: [],
  };
  const httpDiagnostics: HttpDiagnostics = {
    request: {
      method: 'GET',
      url: 'https://anchor.example.com/auth',
      headers: { Accept: 'application/json' },
    },
    response: {
      status: 200,
      statusText: 'OK',
      headers: {},
      body: { transaction: challenge.xdr },
      timing: 10,
    },
  };
  const validationChecks: ValidationCheck[] = [
    { name: 'Sequence Number', passed: true, message: 'Sequence number is 0' },
  ];

  beforeEach(async () => {
    service = {
      fetchChallenge: jest.fn(),
      validateChallenge: jest.fn(),
      signChallenge: jest.fn(),
      exchangeToken: jest.fn(),
    };

    module = await Test.createTestingModule({
      controllers: [Sep10DebuggerController],
      providers: [{ provide: Sep10DebuggerService, useValue: service }],
    }).compile();

    controller = module.get(Sep10DebuggerController);
  });

  afterEach(async () => {
    await module.close();
  });

  it('is defined', () => {
    expect(controller).toBeDefined();
  });

  describe('fetchChallenge', () => {
    const dto: ChallengeRequestDto = {
      domain: 'https://anchor.example.com',
      account: 'client-public-key',
    };

    it.each<ChallengeRequestDto>([
      dto,
      {
        ...dto,
        network: 'mainnet',
        homeDomain: 'client.example.com',
        clientDomain: 'wallet.example.com',
      },
    ])('forwards the request unchanged and returns challenge diagnostics (%j)', async (input) => {
      const response: Awaited<ReturnType<Sep10DebuggerService['fetchChallenge']>> = {
        challenge,
        httpDiagnostics,
        validationChecks,
      };
      service.fetchChallenge.mockResolvedValueOnce(response);

      await expect(controller.fetchChallenge(input)).resolves.toBe(response);
      expect(service.fetchChallenge).toHaveBeenCalledTimes(1);
      expect(service.fetchChallenge).toHaveBeenCalledWith(input);
      expect(service.fetchChallenge.mock.calls[0][0]).toBe(input);
    });

    it.each([
      ['bad requests', () => new BadRequestException('Challenge fetch failed')],
      ['unexpected errors', () => new Error('Anchor unavailable')],
    ])('propagates %s without wrapping them', async (_name, createError) => {
      const error = createError();
      service.fetchChallenge.mockRejectedValueOnce(error);

      await expect(controller.fetchChallenge(dto)).rejects.toBe(error);
      expect(service.fetchChallenge).toHaveBeenCalledTimes(1);
      expect(service.fetchChallenge).toHaveBeenCalledWith(dto);
    });
  });

  describe('validateChallenge', () => {
    const dto: ValidateChallengeDto = {
      challengeXdr: challenge.xdr,
      serverAccountId: 'server-public-key',
      clientAccountId: 'client-public-key',
    };

    it.each<ValidateChallengeDto>([
      dto,
      {
        ...dto,
        network: 'mainnet',
        homeDomain: 'anchor.example.com',
        webAuthDomain: 'auth.anchor.example.com',
      },
    ])('forwards the validation request and returns the service result (%j)', async (input) => {
      const response: Awaited<ReturnType<Sep10DebuggerService['validateChallenge']>> = {
        challenge,
        validationChecks,
      };
      service.validateChallenge.mockResolvedValueOnce(response);

      await expect(controller.validateChallenge(input)).resolves.toBe(response);
      expect(service.validateChallenge).toHaveBeenCalledTimes(1);
      expect(service.validateChallenge).toHaveBeenCalledWith(input);
      expect(service.validateChallenge.mock.calls[0][0]).toBe(input);
    });

    it('returns failed validation checks as diagnostics rather than throwing', async () => {
      const response: Awaited<ReturnType<Sep10DebuggerService['validateChallenge']>> = {
        challenge,
        validationChecks: [
          { name: 'Server Signature', passed: false, message: 'Invalid server signature' },
        ],
      };
      service.validateChallenge.mockResolvedValueOnce(response);

      await expect(controller.validateChallenge(dto)).resolves.toBe(response);
      expect(service.validateChallenge).toHaveBeenCalledTimes(1);
      expect(service.validateChallenge).toHaveBeenCalledWith(dto);
    });

    it.each([
      ['bad requests', () => new BadRequestException('Invalid challenge XDR')],
      ['unexpected errors', () => new Error('Validation unavailable')],
    ])('propagates %s without wrapping them', async (_name, createError) => {
      const error = createError();
      service.validateChallenge.mockRejectedValueOnce(error);

      await expect(controller.validateChallenge(dto)).rejects.toBe(error);
      expect(service.validateChallenge).toHaveBeenCalledTimes(1);
      expect(service.validateChallenge).toHaveBeenCalledWith(dto);
    });
  });

  describe('signChallenge', () => {
    const dto: SignChallengeDto = {
      challengeXdr: challenge.xdr,
      clientKeypair: 'test-only-client-secret',
    };

    it.each<SignChallengeDto>([dto, { ...dto, clientDomainKeypair: 'test-only-domain-secret' }])(
      'forwards signing keys and preserves the signed response (%j)',
      async (input) => {
        const response: Awaited<ReturnType<Sep10DebuggerService['signChallenge']>> = {
          signedXdr: 'signed-challenge-xdr',
          signatures: [{ publicKey: 'client-key-hint', signature: 'client-signature' }],
          redactionNotice: 'Secret keys have been redacted for security',
        };
        service.signChallenge.mockResolvedValueOnce(response);

        await expect(controller.signChallenge(input)).resolves.toBe(response);
        expect(service.signChallenge).toHaveBeenCalledTimes(1);
        expect(service.signChallenge).toHaveBeenCalledWith(input);
        expect(service.signChallenge.mock.calls[0][0]).toBe(input);
      },
    );

    it.each([
      ['bad requests', () => new BadRequestException('Invalid signing keypair')],
      ['unexpected errors', () => new Error('Signing unavailable')],
    ])('propagates %s without wrapping them', async (_name, createError) => {
      const error = createError();
      service.signChallenge.mockRejectedValueOnce(error);

      await expect(controller.signChallenge(dto)).rejects.toBe(error);
      expect(service.signChallenge).toHaveBeenCalledTimes(1);
      expect(service.signChallenge).toHaveBeenCalledWith(dto);
    });
  });

  describe('exchangeToken', () => {
    const dto: TokenExchangeDto = {
      signedChallengeXdr: 'signed-challenge-xdr',
      domain: 'https://anchor.example.com',
    };

    it('forwards the signed challenge and preserves the redacted token response', async () => {
      const response: Awaited<ReturnType<Sep10DebuggerService['exchangeToken']>> = {
        token: '[REDACTED_FOR_SECURITY]',
        decodedClaims: { iss: 'anchor.example.com', sub: 'client-public-key' },
        httpDiagnostics: {
          ...httpDiagnostics,
          request: {
            method: 'POST',
            url: 'https://anchor.example.com/auth',
            headers: { 'Content-Type': 'application/json' },
            body: { transaction: '[REDACTED_XDR]' },
          },
          response: { ...httpDiagnostics.response, body: { token: '[REDACTED_FOR_SECURITY]' } },
        },
        redactionNotice: 'JWT token has been redacted from response for security',
      };
      service.exchangeToken.mockResolvedValueOnce(response);

      await expect(controller.exchangeToken(dto)).resolves.toBe(response);
      expect(service.exchangeToken).toHaveBeenCalledTimes(1);
      expect(service.exchangeToken).toHaveBeenCalledWith(dto);
      expect(service.exchangeToken.mock.calls[0][0]).toBe(dto);
    });

    it.each([
      ['bad requests', () => new BadRequestException('Token exchange failed')],
      ['unexpected errors', () => new Error('Token endpoint unavailable')],
    ])('propagates %s without wrapping them', async (_name, createError) => {
      const error = createError();
      service.exchangeToken.mockRejectedValueOnce(error);

      await expect(controller.exchangeToken(dto)).rejects.toBe(error);
      expect(service.exchangeToken).toHaveBeenCalledTimes(1);
      expect(service.exchangeToken).toHaveBeenCalledWith(dto);
    });
  });
});
