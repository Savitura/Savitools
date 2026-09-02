import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { HttpStatus } from '@nestjs/common';
import { MonitorController } from './monitor.controller';
import { MonitorService } from './monitor.service';
import type { FastifyReply } from 'fastify';

describe('MonitorController SSE and Metrics', () => {
  let controller: MonitorController;
  let configService: ConfigService;

  const mockMonitorService = {
    createWatch: jest.fn(),
    listWatches: jest.fn(),
    getWatch: jest.fn(),
    deleteWatch: jest.fn(),
    getWatchEvents: jest.fn(),
    getAlertEvents: jest.fn(),
    registerWebhook: jest.fn(),
    getWebhook: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn((key: string, defaultValue?: any) => {
      if (key === 'MAX_SSE_CONNECTIONS') return '2';
      return defaultValue;
    }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MonitorController],
      providers: [
        { provide: MonitorService, useValue: mockMonitorService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    controller = module.get<MonitorController>(MonitorController);
    configService = module.get<ConfigService>(ConfigService);
  });

  it('exposes metrics via /metrics endpoint', () => {
    const metrics = controller.getMetrics();
    expect(metrics).toEqual({
      activeSseConnections: 0,
      maxSseConnections: 2,
    });
  });

  it('returns 503 when SSE connections exceed the configured MAX_SSE_CONNECTIONS limit', async () => {
    const createFakeReply = () => {
      return {
        raw: {
          setHeader: jest.fn(),
          flushHeaders: jest.fn(),
          write: jest.fn(),
          on: jest.fn(),
          writableEnded: false,
          end: jest.fn(),
        },
        status: jest.fn().mockReturnThis(),
        send: jest.fn(),
      } as unknown as FastifyReply;
    };

    const reply1 = createFakeReply();
    const reply2 = createFakeReply();
    const reply3 = createFakeReply();

    await controller.stream(reply1);
    await controller.stream(reply2);

    expect(controller.getMetrics().activeSseConnections).toBe(2);

    await controller.stream(reply3);

    expect(reply3.status).toHaveBeenCalledWith(HttpStatus.SERVICE_UNAVAILABLE);
    expect(reply3.send).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.SERVICE_UNAVAILABLE,
        message: 'Maximum SSE connections reached',
      }),
    );
  });

  it('cleans up connections on client disconnect', async () => {
    const rawListeners: Record<string, Function> = {};
    const reply = {
      raw: {
        setHeader: jest.fn(),
        flushHeaders: jest.fn(),
        write: jest.fn(),
        on: jest.fn((event: string, fn: Function) => {
          rawListeners[event] = fn;
        }),
        writableEnded: false,
        end: jest.fn(),
      },
      status: jest.fn().mockReturnThis(),
      send: jest.fn(),
    } as unknown as FastifyReply;

    await controller.stream(reply);
    expect(controller.getMetrics().activeSseConnections).toBe(1);

    // Simulate client close/disconnect
    rawListeners['close']?.();

    expect(controller.getMetrics().activeSseConnections).toBe(0);
  });
});
