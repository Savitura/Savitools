import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import cookie from '@fastify/cookie';
import { randomBytes } from 'crypto';
import { FastifyRequest } from 'fastify';
import { ACCESS_TOKEN_COOKIE } from '../auth.constants';
import { AuthUser } from '../decorators/current-user.decorator';
import { JwtAuthGuard } from './jwt-auth.guard';
import { OptionalJwtAuthGuard } from './optional-jwt-auth.guard';

const protectedHandler = jest.fn();

@Controller('auth-boundary')
class AuthenticationBoundaryController {
  @Get('required')
  @UseGuards(JwtAuthGuard)
  required(@Req() request: FastifyRequest & { user?: AuthUser }) {
    protectedHandler();
    return { user: request.user ?? null };
  }

  @Get('optional')
  @UseGuards(OptionalJwtAuthGuard)
  optional(@Req() request: FastifyRequest & { user?: AuthUser }) {
    return { user: request.user ?? null };
  }
}

// Exercise the real guards at the HTTP boundary. Route-contract tests override
// guards, so they cannot detect accidentally accepting a demo key or bad JWT.
describe('authentication boundary without legacy demo credentials', () => {
  let app: NestFastifyApplication;
  let jwt: JwtService;
  let config: ConfigService;
  let validToken: string;
  let invalidTokens: Record<string, string>;
  const user = { id: 'authenticated-user', email: 'user@example.test' };
  const originalApiKey = process.env.SAVITOOLS_API_KEY;

  beforeAll(async () => {
    const secret = randomBytes(32).toString('hex');
    jwt = new JwtService({ secret });
    config = new ConfigService({ JWT_SECRET: secret });
    validToken = jwt.sign({ sub: user.id, email: user.email }, { expiresIn: '5m' });
    invalidTokens = {
      demo: 'SAVITOOLS_API_KEY_DEMO',
      malformed: 'not-a-jwt',
      expired: jwt.sign({ sub: user.id, email: user.email }, { expiresIn: -60 }),
      forged: jwt.sign(
        { sub: user.id, email: user.email },
        { secret: randomBytes(32).toString('hex'), expiresIn: '5m' },
      ),
    };
    const module = await Test.createTestingModule({
      controllers: [AuthenticationBoundaryController],
      providers: [
        JwtAuthGuard,
        OptionalJwtAuthGuard,
        { provide: JwtService, useValue: jwt },
        { provide: ConfigService, useValue: config },
      ],
    }).compile();
    app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.register(cookie);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  beforeEach(() => protectedHandler.mockClear());

  afterEach(() => {
    jest.restoreAllMocks();
    if (originalApiKey === undefined) delete process.env.SAVITOOLS_API_KEY;
    else process.env.SAVITOOLS_API_KEY = originalApiKey;
  });

  afterAll(async () => {
    await app?.close();
  });

  it.each(['unset', 'configured'])(
    'rejects API keys with legacy configuration %s',
    async (mode) => {
      if (mode === 'unset') delete process.env.SAVITOOLS_API_KEY;
      else process.env.SAVITOOLS_API_KEY = 'configured-test-api-key';

      for (const apiKey of [
        undefined,
        'SAVITOOLS_API_KEY_DEMO',
        'configured-test-api-key',
        'wrong-key',
      ]) {
        const response = await app.inject({
          method: 'GET',
          url: '/auth-boundary/required',
          headers: apiKey === undefined ? {} : { 'x-api-key': apiKey },
        });
        expect(response.statusCode).toBe(401);
        expect(response.json().message).toBe('Authentication required');
        expect(response.body).not.toContain('demo-user');
      }
      expect(protectedHandler).not.toHaveBeenCalled();
    },
  );

  it.each(['bearer', 'cookie'])('accepts a correctly signed JWT via %s', async (transport) => {
    const response = await app.inject({
      method: 'GET',
      url: '/auth-boundary/required',
      headers:
        transport === 'bearer'
          ? { authorization: `Bearer ${validToken}` }
          : { cookie: `${ACCESS_TOKEN_COOKIE}=${validToken}` },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ user });
    expect(protectedHandler).toHaveBeenCalledTimes(1);
  });

  it.each(['demo', 'malformed', 'expired', 'forged'])(
    'rejects %s tokens in both transports',
    async (kind) => {
      const token = invalidTokens[kind];
      for (const headers of [
        { authorization: `Bearer ${token}` },
        { cookie: `${ACCESS_TOKEN_COOKIE}=${token}` },
      ]) {
        const response = await app.inject({
          method: 'GET',
          url: '/auth-boundary/required',
          headers,
        });
        expect(response.statusCode).toBe(401);
        expect(response.json().message).toBe('Invalid or expired token');
        expect(response.body).not.toContain(token);
      }
      expect(protectedHandler).not.toHaveBeenCalled();
    },
  );

  it('preserves cookie precedence instead of falling back from an invalid cookie', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/auth-boundary/required',
      headers: {
        cookie: `${ACCESS_TOKEN_COOKIE}=${invalidTokens.demo}`,
        authorization: `Bearer ${validToken}`,
      },
    });
    expect(response.statusCode).toBe(401);
    expect(protectedHandler).not.toHaveBeenCalled();
  });

  it('fails closed if the signing-secret configuration is unavailable', async () => {
    jest.spyOn(config, 'getOrThrow').mockImplementationOnce(() => {
      throw new Error('JWT_SECRET unavailable');
    });
    const response = await app.inject({
      method: 'GET',
      url: '/auth-boundary/required',
      headers: { authorization: `Bearer ${validToken}` },
    });
    expect(response.statusCode).toBe(401);
    expect(protectedHandler).not.toHaveBeenCalled();
    expect(response.body).not.toContain('JWT_SECRET');
  });

  it('keeps optional requests anonymous for missing, demo, and invalid credentials', async () => {
    const headersList = [
      {},
      { 'x-api-key': 'SAVITOOLS_API_KEY_DEMO' },
      ...Object.values(invalidTokens).flatMap((token) => [
        { authorization: `Bearer ${token}` },
        { cookie: `${ACCESS_TOKEN_COOKIE}=${token}` },
      ]),
    ];
    for (const headers of headersList) {
      const response = await app.inject({ method: 'GET', url: '/auth-boundary/optional', headers });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ user: null });
    }
  });

  it.each(['bearer', 'cookie'])('identifies valid optional callers via %s', async (transport) => {
    const response = await app.inject({
      method: 'GET',
      url: '/auth-boundary/optional',
      headers:
        transport === 'bearer'
          ? { authorization: `Bearer ${validToken}` }
          : { cookie: `${ACCESS_TOKEN_COOKIE}=${validToken}` },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ user });
  });
});
