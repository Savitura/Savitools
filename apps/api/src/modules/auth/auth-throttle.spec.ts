import { Controller, Post } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { Throttle, ThrottlerModule } from '@nestjs/throttler';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import {
  AUTH_ROUTE_THROTTLE_LIMIT,
  AUTH_ROUTE_THROTTLE_TTL_MS,
} from './auth.constants';
import { ThrottlerBehindProxyGuard } from '../../common/throttler-behind-proxy.guard';

@Controller('auth')
class AuthThrottleFixtureController {
  @Post('login')
  @Throttle({
    default: {
      limit: AUTH_ROUTE_THROTTLE_LIMIT,
      ttl: AUTH_ROUTE_THROTTLE_TTL_MS,
    },
  })
  login() {
    return { ok: true };
  }

  @Post('register')
  @Throttle({
    default: {
      limit: AUTH_ROUTE_THROTTLE_LIMIT,
      ttl: AUTH_ROUTE_THROTTLE_TTL_MS,
    },
  })
  register() {
    return { ok: true };
  }

  @Post('forgot-password')
  @Throttle({
    default: {
      limit: AUTH_ROUTE_THROTTLE_LIMIT,
      ttl: AUTH_ROUTE_THROTTLE_TTL_MS,
    },
  })
  forgotPassword() {
    return { message: 'ok' };
  }

  @Post('reset-password')
  @Throttle({
    default: {
      limit: AUTH_ROUTE_THROTTLE_LIMIT,
      ttl: AUTH_ROUTE_THROTTLE_TTL_MS,
    },
  })
  resetPassword() {
    return { ok: true };
  }
}

describe('Auth route throttling (Savitura/Savitools#418)', () => {
  let app: NestFastifyApplication;

  beforeEach(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [
        ThrottlerModule.forRoot([
          {
            // Global limit is intentionally higher than the auth override so
            // the test proves @Throttle tightens the auth routes.
            ttl: 60_000,
            limit: 100,
          },
        ]),
      ],
      controllers: [AuthThrottleFixtureController],
      providers: [
        {
          provide: APP_GUARD,
          useClass: ThrottlerBehindProxyGuard,
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it.each(['/auth/login', '/auth/register', '/auth/forgot-password', '/auth/reset-password'])(
    'returns 429 after %s exceeds %s requests per minute',
    async (url) => {
      for (let i = 0; i < AUTH_ROUTE_THROTTLE_LIMIT; i++) {
        const allowed = await app.inject({ method: 'POST', url });
        expect(allowed.statusCode).toBe(201);
      }

      const blocked = await app.inject({ method: 'POST', url });
      expect(blocked.statusCode).toBe(429);
    },
  );
});
