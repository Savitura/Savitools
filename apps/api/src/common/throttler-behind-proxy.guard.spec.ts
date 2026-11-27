import { Controller, Get } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test, TestingModule } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import { ThrottlerBehindProxyGuard } from './throttler-behind-proxy.guard';

class TestableThrottlerBehindProxyGuard extends ThrottlerBehindProxyGuard {
  public extractTracker(req: Record<string, unknown>): Promise<string> {
    return this.getTracker(req);
  }
}

@Controller('guard-probe')
class GuardProbeController {
  @Get()
  ok() {
    return { ok: true };
  }
}

describe('ThrottlerBehindProxyGuard', () => {
  describe('getTracker IP extraction', () => {
    let guard: TestableThrottlerBehindProxyGuard;

    beforeEach(async () => {
      const moduleRef: TestingModule = await Test.createTestingModule({
        imports: [
          ThrottlerModule.forRoot([
            {
              ttl: 60_000,
              limit: 10,
            },
          ]),
        ],
        providers: [TestableThrottlerBehindProxyGuard],
      }).compile();

      guard = moduleRef.get(TestableThrottlerBehindProxyGuard);
    });

    it('returns req.ip when it is a non-empty string', async () => {
      await expect(guard.extractTracker({ ip: '203.0.113.10' })).resolves.toBe('203.0.113.10');
    });

    it('supports IPv6 addresses in req.ip', async () => {
      await expect(guard.extractTracker({ ip: '2001:db8::1' })).resolves.toBe('2001:db8::1');
    });

    it('prefers req.ip over req.ips so proxy IP at ips[0] does not collapse buckets', async () => {
      await expect(
        guard.extractTracker({
          ip: '198.51.100.42',
          ips: ['10.0.0.1', '10.0.0.2', '198.51.100.42'],
        }),
      ).resolves.toBe('198.51.100.42');
    });

    it('ignores raw X-Forwarded-For header when req.ip is resolved by Fastify', async () => {
      await expect(
        guard.extractTracker({
          ip: '192.0.2.50',
          headers: { 'x-forwarded-for': '198.51.100.99' },
        }),
      ).resolves.toBe('192.0.2.50');
    });

    it('falls back to the last entry of req.ips (client IP) when req.ip is missing', async () => {
      await expect(
        guard.extractTracker({
          ips: ['10.0.0.1', '10.0.0.2', '203.0.113.77'],
        }),
      ).resolves.toBe('203.0.113.77');
    });

    it('falls back to the last entry of req.ips when req.ip is empty', async () => {
      await expect(
        guard.extractTracker({
          ip: '',
          ips: ['10.0.0.1', '203.0.113.88'],
        }),
      ).resolves.toBe('203.0.113.88');
    });

    it('returns the sole entry of req.ips when req.ip is absent', async () => {
      await expect(
        guard.extractTracker({
          ips: ['203.0.113.99'],
        }),
      ).resolves.toBe('203.0.113.99');
    });

    it('returns "unknown" when neither req.ip nor req.ips contains a usable IP', async () => {
      await expect(guard.extractTracker({})).resolves.toBe('unknown');
      await expect(guard.extractTracker({ ip: '', ips: [] })).resolves.toBe('unknown');
      await expect(guard.extractTracker({ ip: 123, ips: [123] })).resolves.toBe('unknown');
      await expect(guard.extractTracker({ ip: undefined, ips: ['10.0.0.1', ''] })).resolves.toBe(
        'unknown',
      );
      await expect(guard.extractTracker({ ip: null, ips: 'not-an-array' })).resolves.toBe(
        'unknown',
      );
    });
  });

  describe('Fastify proxy trust integration', () => {
    async function createProbeApp(trustProxy: boolean): Promise<NestFastifyApplication> {
      const moduleRef: TestingModule = await Test.createTestingModule({
        imports: [
          ThrottlerModule.forRoot([
            {
              ttl: 60_000,
              limit: 1,
            },
          ]),
        ],
        controllers: [GuardProbeController],
        providers: [
          {
            provide: APP_GUARD,
            useClass: ThrottlerBehindProxyGuard,
          },
        ],
      }).compile();

      const app = moduleRef.createNestApplication<NestFastifyApplication>(
        new FastifyAdapter({ trustProxy }),
      );
      await app.init();
      await app.getHttpAdapter().getInstance().ready();
      return app;
    }

    it('prevents X-Forwarded-For spoofing when trustProxy is disabled', async () => {
      const app = await createProbeApp(false);
      try {
        const first = await app.inject({
          method: 'GET',
          url: '/guard-probe',
          remoteAddress: '198.51.100.5',
          headers: { 'x-forwarded-for': '203.0.113.1' },
        });
        expect(first.statusCode).toBe(200);

        const spoofed = await app.inject({
          method: 'GET',
          url: '/guard-probe',
          remoteAddress: '198.51.100.5',
          headers: { 'x-forwarded-for': '203.0.113.2' },
        });
        expect(spoofed.statusCode).toBe(429);
      } finally {
        await app.close();
      }
    });

    it('isolates distinct forwarded clients behind a proxy without collapsing onto the proxy IP', async () => {
      const app = await createProbeApp(true);
      try {
        const clientAFirst = await app.inject({
          method: 'GET',
          url: '/guard-probe',
          remoteAddress: '10.0.0.1',
          headers: { 'x-forwarded-for': '203.0.113.10, 10.0.0.2' },
        });
        expect(clientAFirst.statusCode).toBe(200);

        const clientASecond = await app.inject({
          method: 'GET',
          url: '/guard-probe',
          remoteAddress: '10.0.0.1',
          headers: { 'x-forwarded-for': '203.0.113.10, 10.0.0.2' },
        });
        expect(clientASecond.statusCode).toBe(429);

        const clientB = await app.inject({
          method: 'GET',
          url: '/guard-probe',
          remoteAddress: '10.0.0.1',
          headers: { 'x-forwarded-for': '203.0.113.20, 10.0.0.2' },
        });
        expect(clientB.statusCode).toBe(200);
      } finally {
        await app.close();
      }
    });
  });
});
