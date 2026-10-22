import { Controller, Get } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { ThrottlerBehindProxyGuard } from '../common/throttler-behind-proxy.guard';

@Controller('probe')
class ProbeController {
  @Get()
  ok() {
    return { ok: true };
  }
}

describe('Trust proxy + throttling (Savitura/Savitools#419)', () => {
  let app: NestFastifyApplication;

  beforeEach(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [
        ThrottlerModule.forRoot([
          {
            ttl: 60_000,
            limit: 1,
          },
        ]),
      ],
      controllers: [ProbeController],
      providers: [
        {
          provide: APP_GUARD,
          useClass: ThrottlerBehindProxyGuard,
        },
      ],
    }).compile();

    // trustProxy: true lets Fastify resolve req.ip / req.ips from
    // X-Forwarded-For (Savitura/Savitools#419 acceptance: separate buckets).
    app = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter({ trustProxy: true }),
    );
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it('gives separate rate-limit buckets to two X-Forwarded-For clients', async () => {
    const injectAs = (forwardedFor: string) =>
      app.inject({
        method: 'GET',
        url: '/probe',
        // Simulate the TCP peer as the reverse proxy so X-Forwarded-For is used.
        remoteAddress: '10.0.0.1',
        headers: { 'x-forwarded-for': forwardedFor },
      });

    const firstClient = await injectAs('203.0.113.10');
    expect(firstClient.statusCode).toBe(200);

    // Same client exhausts its single-request budget.
    const firstClientAgain = await injectAs('203.0.113.10');
    expect(firstClientAgain.statusCode).toBe(429);

    // A different forwarded client still has its own budget.
    const secondClient = await injectAs('203.0.113.20');
    expect(secondClient.statusCode).toBe(200);
  });
});
