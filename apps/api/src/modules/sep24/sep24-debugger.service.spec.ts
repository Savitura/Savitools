import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import * as nodeDns from 'node:dns/promises';
import { Sep24DebuggerService } from './sep24-debugger.service';
import { Sep24Operation } from './dto/start-session.dto';

describe('Sep24DebuggerService', () => {
  let service: Sep24DebuggerService;

  beforeEach(async () => {
    // Ensure DNS lookup resolves to a safe public IP so assertSafeServerTarget passes in tests
    jest.spyOn(nodeDns, 'lookup').mockResolvedValue([
      { address: '93.184.216.34', family: 4 },
    ] as any);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        Sep24DebuggerService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockImplementation((key: string, defaultValue: string) => {
              if (key === 'SEP24_POLL_TIMEOUT_MS') return '300000';
              return defaultValue;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<Sep24DebuggerService>(Sep24DebuggerService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('startSession against mocked anchor', () => {
    it('starts a deposit session against a mocked anchor successfully', async () => {
      const mockToml = `
TRANSFER_SERVER_SEP0024 = "https://anchor.example.com/sep24"
WEB_AUTH_ENDPOINT = "https://anchor.example.com/auth"
`;
      const mockInteractiveResponse = {
        transaction: {
          id: 'tx-deposit-101',
          url: 'https://anchor.example.com/sep24/interactive?transaction_id=tx-deposit-101',
          status: 'incomplete',
        },
      };

      jest.spyOn((service as any).http, 'get').mockResolvedValueOnce({
        status: 200,
        data: mockToml as any,
      });

      const postSpy = jest.spyOn((service as any).http, 'post').mockResolvedValueOnce({
        status: 200,
        data: mockInteractiveResponse as any,
      });

      const session = await service.startSession({
        anchorDomain: 'https://anchor.example.com',
        assetCode: 'USDC',
        operation: Sep24Operation.DEPOSIT,
        jwt: 'valid-test-jwt-token',
        amount: 50,
      });

      expect(session).toBeDefined();
      expect(session.id).toBeDefined();
      expect(session.anchorDomain).toBe('anchor.example.com');
      expect(session.assetCode).toBe('USDC');
      expect(session.operation).toBe(Sep24Operation.DEPOSIT);
      expect(session.transferServer).toBe('https://anchor.example.com/sep24');
      expect(session.interactiveUrl).toBe(
        'https://anchor.example.com/sep24/interactive?transaction_id=tx-deposit-101',
      );
      expect(session.transactionId).toBe('tx-deposit-101');
      expect(session.lastStatus).toBe('incomplete');

      // Verify POST call was sent to correct interactive endpoint with JWT header
      expect(postSpy).toHaveBeenCalledWith(
        'https://anchor.example.com/sep24/transactions/deposit/interactive',
        expect.objectContaining({
          asset_code: 'USDC',
          amount: '50',
        }),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer valid-test-jwt-token',
          }),
        }),
      );

      // Verify timeline recorded discovery, auth, and interactive steps
      const entries = session.timeline.getEntries();
      expect(entries.length).toBeGreaterThanOrEqual(3);
      expect(entries.some((e) => e.kind === 'discovery')).toBe(true);
      expect(entries.some((e) => e.kind === 'auth')).toBe(true);
      expect(entries.some((e) => e.kind === 'interactive_url')).toBe(true);
    });

    it('starts a withdrawal session against a mocked anchor', async () => {
      const mockToml = `TRANSFER_SERVER_SEP0024 = "https://anchor.example.com/sep24"`;
      const mockInteractiveResponse = {
        transaction: {
          id: 'tx-withdraw-202',
          url: 'https://anchor.example.com/sep24/interactive?transaction_id=tx-withdraw-202',
          status: 'incomplete',
        },
      };

      jest.spyOn((service as any).http, 'get').mockResolvedValueOnce({
        status: 200,
        data: mockToml as any,
      });

      const postSpy = jest.spyOn((service as any).http, 'post').mockResolvedValueOnce({
        status: 200,
        data: mockInteractiveResponse as any,
      });

      const session = await service.startSession({
        anchorDomain: 'anchor.example.com',
        assetCode: 'USDC',
        operation: Sep24Operation.WITHDRAWAL,
        sep10Jwt: 'valid-test-sep10-jwt',
      });

      expect(session.operation).toBe(Sep24Operation.WITHDRAWAL);
      expect(session.interactiveUrl).toBe(
        'https://anchor.example.com/sep24/interactive?transaction_id=tx-withdraw-202',
      );
      expect(postSpy).toHaveBeenCalledWith(
        'https://anchor.example.com/sep24/transactions/withdrawal/interactive',
        expect.objectContaining({ asset_code: 'USDC' }),
        expect.any(Object),
      );
    });

    it('throws BadRequestException if anchor stellar.toml is missing TRANSFER_SERVER_SEP0024', async () => {
      jest.spyOn((service as any).http, 'get').mockResolvedValueOnce({
        status: 200,
        data: `WEB_AUTH_ENDPOINT = "https://anchor.example.com/auth"` as any,
      });

      await expect(
        service.startSession({
          anchorDomain: 'anchor.example.com',
          assetCode: 'USDC',
          operation: Sep24Operation.DEPOSIT,
          jwt: 'fake-jwt',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException if no JWT is provided', async () => {
      jest.spyOn((service as any).http, 'get').mockResolvedValueOnce({
        status: 200,
        data: `TRANSFER_SERVER_SEP0024 = "https://anchor.example.com/sep24"` as any,
      });

      await expect(
        service.startSession({
          anchorDomain: 'anchor.example.com',
          assetCode: 'USDC',
          operation: Sep24Operation.DEPOSIT,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when anchor rejects the interactive request', async () => {
      jest.spyOn((service as any).http, 'get').mockResolvedValueOnce({
        status: 200,
        data: `TRANSFER_SERVER_SEP0024 = "https://anchor.example.com/sep24"` as any,
      });

      jest.spyOn((service as any).http, 'post').mockResolvedValueOnce({
        status: 400,
        data: { error: 'Asset not supported for interactive deposit' } as any,
      });

      await expect(
        service.startSession({
          anchorDomain: 'anchor.example.com',
          assetCode: 'UNSUPPORTED',
          operation: Sep24Operation.DEPOSIT,
          jwt: 'valid-jwt',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('session lifecycle: pollStatus, cancelSession, exportTimeline', () => {
    it('polls status, updates transaction record, and cancels session', async () => {
      // 1. Setup session
      jest.spyOn((service as any).http, 'get').mockResolvedValueOnce({
        status: 200,
        data: `TRANSFER_SERVER_SEP0024 = "https://anchor.example.com/sep24"` as any,
      });
      jest.spyOn((service as any).http, 'post').mockResolvedValueOnce({
        status: 200,
        data: {
          transaction: {
            id: 'tx-lifecycle',
            url: 'https://anchor.example.com/sep24/interactive?transaction_id=tx-lifecycle',
            status: 'incomplete',
          },
        } as any,
      });

      const session = await service.startSession({
        anchorDomain: 'anchor.example.com',
        assetCode: 'USDC',
        operation: Sep24Operation.DEPOSIT,
        jwt: 'valid-jwt',
      });

      // 2. Mock GET transaction endpoint for pollStatus
      jest.spyOn((service as any).http, 'get').mockResolvedValueOnce({
        status: 200,
        data: {
          transaction: {
            id: 'tx-lifecycle',
            status: 'completed',
            amount_in: '50.0',
          },
        } as any,
      });

      const pollResult = await service.pollStatus(session.id);
      expect(pollResult.status).toBe('completed');
      expect(pollResult.transaction?.id).toBe('tx-lifecycle');

      // 3. Export timeline
      const exported = service.exportTimeline(session.id);
      expect(exported.sessionId).toBe(session.id);
      expect(exported.entries.length).toBeGreaterThan(0);

      // 4. Cancel session
      const cancelled = service.cancelSession(session.id);
      expect(cancelled.id).toBe(session.id);
    });

    it('throws NotFoundException when polling non-existent session', async () => {
      await expect(service.pollStatus('non-existent-uuid')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
