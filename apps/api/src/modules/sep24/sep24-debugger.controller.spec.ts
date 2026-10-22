import { Test, TestingModule } from '@nestjs/testing';
import { Sep24DebuggerController } from './sep24-debugger.controller';
import { Sep24DebuggerService } from './sep24-debugger.service';
import { Sep24Operation, StartSessionDto } from './dto/start-session.dto';
import { Sep24Timeline } from './sep24-timeline';

describe('Sep24DebuggerController', () => {
  let controller: Sep24DebuggerController;
  let service: Sep24DebuggerService;

  const mockTimeline = new Sep24Timeline('session-1', {
    assetCode: 'USDC',
    operation: 'deposit',
    anchorDomain: 'anchor.example.com',
  });

  const mockSession = {
    id: 'session-1',
    anchorDomain: 'anchor.example.com',
    assetCode: 'USDC',
    operation: Sep24Operation.DEPOSIT,
    transferServer: 'https://anchor.example.com/sep24',
    interactiveUrl: 'https://anchor.example.com/sep24/interactive?id=tx-1',
    transactionId: 'tx-1',
    lastStatus: 'incomplete',
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 300000).toISOString(),
    timeline: mockTimeline,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [Sep24DebuggerController],
      providers: [
        {
          provide: Sep24DebuggerService,
          useValue: {
            startSession: jest.fn().mockResolvedValue(mockSession),
            getTimeline: jest.fn().mockReturnValue(mockTimeline.getEntries()),
            exportTimeline: jest.fn().mockReturnValue({
              sessionId: 'session-1',
              assetCode: 'USDC',
              operation: 'deposit',
              anchorDomain: 'anchor.example.com',
              entries: [],
            }),
            pollStatus: jest.fn().mockResolvedValue({ status: 'completed' }),
            cancelSession: jest.fn().mockReturnValue(mockSession),
          },
        },
      ],
    }).compile();

    controller = module.get<Sep24DebuggerController>(Sep24DebuggerController);
    service = module.get<Sep24DebuggerService>(Sep24DebuggerService);
  });

  it('starts a session and returns structured response', async () => {
    const dto: StartSessionDto = {
      anchorDomain: 'anchor.example.com',
      assetCode: 'USDC',
      operation: Sep24Operation.DEPOSIT,
      jwt: 'jwt-123',
    };

    const result = await controller.startSession(dto);
    expect(service.startSession).toHaveBeenCalledWith(dto);
    expect(result.sessionId).toBe('session-1');
    expect(result.anchorDomain).toBe('anchor.example.com');
    expect(result.interactiveUrl).toBe(
      'https://anchor.example.com/sep24/interactive?id=tx-1',
    );
  });

  it('gets timeline for a session', () => {
    const result = controller.getTimeline('session-1');
    expect(service.getTimeline).toHaveBeenCalledWith('session-1');
    expect(result.sessionId).toBe('session-1');
    expect(Array.isArray(result.entries)).toBe(true);
  });

  it('exports timeline for a session', () => {
    const result = controller.exportTimeline('session-1');
    expect(service.exportTimeline).toHaveBeenCalledWith('session-1');
    expect(result.sessionId).toBe('session-1');
  });

  it('polls status for a session', async () => {
    const result = await controller.pollStatus('session-1', {
      sessionId: 'session-1',
      jwt: 'jwt-123',
    });
    expect(service.pollStatus).toHaveBeenCalledWith('session-1', 'jwt-123');
    expect(result.status).toBe('completed');
  });

  it('cancels a session', () => {
    const result = controller.cancelSession('session-1');
    expect(service.cancelSession).toHaveBeenCalledWith('session-1');
    expect(result.sessionId).toBe('session-1');
    expect(result.cancelled).toBe(true);
  });
});
