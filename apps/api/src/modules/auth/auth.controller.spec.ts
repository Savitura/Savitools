import {
  ConflictException,
  GoneException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FastifyReply, FastifyRequest } from 'fastify';
import { AuthController, clientAddress } from './auth.controller';
import { AuthService } from './auth.service';
import { FluxaOAuthService } from './fluxa-oauth.service';
import { PasskeyAuthService } from './passkey-auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from './guards/optional-jwt-auth.guard';
import {
  ACCESS_TOKEN_COOKIE,
  ACCESS_TOKEN_TTL_SECONDS,
  REFRESH_TOKEN_COOKIE,
  REFRESH_TOKEN_TTL_SECONDS,
} from './auth.constants';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: jest.Mocked<Partial<AuthService>>;
  let passkeyAuthService: jest.Mocked<Partial<PasskeyAuthService>>;
  let fluxaOAuthService: jest.Mocked<Partial<FluxaOAuthService>>;
  let configService: jest.Mocked<Partial<ConfigService>>;
  let redis: {
    set: jest.Mock;
    get: jest.Mock;
    del: jest.Mock;
  };

  const mockUser = {
    id: 'user-uuid-1',
    email: 'test@example.com',
    emailVerified: true,
    fluxaTenantId: 'tenant-1',
  };

  const mockTokens = {
    accessToken: 'access-token-xyz',
    refreshToken: 'refresh-token-abc',
  };

  function createMockReply(): FastifyReply {
    const reply = {
      setCookie: jest.fn().mockReturnThis(),
      clearCookie: jest.fn().mockReturnThis(),
    } as unknown as FastifyReply;
    return reply;
  }

  function createMockRequest(options?: {
    ip?: string;
    userAgent?: string;
    cookies?: Record<string, string>;
    user?: { id: string; email: string };
    query?: Record<string, string>;
  }): FastifyRequest & { user?: { id: string; email: string }; query?: Record<string, string> } {
    return {
      ip: options?.ip ?? '127.0.0.1',
      headers: {
        'user-agent': options?.userAgent ?? 'jest-test-agent',
      },
      cookies: options?.cookies ?? {},
      user: options?.user,
      query: options?.query ?? {},
    } as unknown as FastifyRequest & {
      user?: { id: string; email: string };
      query?: Record<string, string>;
    };
  }

  beforeEach(() => {
    authService = {
      register: jest.fn(),
      verifyEmail: jest.fn(),
      login: jest.fn(),
      requestPasswordReset: jest.fn(),
      resetPassword: jest.fn(),
      refresh: jest.fn(),
      logout: jest.fn(),
      listSessions: jest.fn(),
      revokeSession: jest.fn(),
      getUserById: jest.fn(),
    };

    fluxaOAuthService = {
      fluxaLink: jest.fn(),
      listConnectedAccounts: jest.fn(),
      beginFluxaConnect: jest.fn(),
      completeFluxaConnect: jest.fn(),
      disconnectProvider: jest.fn(),
    };

    passkeyAuthService = {
      requestPasskeyReauth: jest.fn(),
      beginPasskeyRegistration: jest.fn(),
      verifyPasskeyRegistration: jest.fn(),
      beginPasskeyLogin: jest.fn(),
      verifyPasskeyLogin: jest.fn(),
      listPasskeys: jest.fn(),
      renamePasskey: jest.fn(),
      revokePasskey: jest.fn(),
    };

    configService = {
      get: jest.fn().mockImplementation((key: string) => {
        if (key === 'NODE_ENV') return 'development';
        return undefined;
      }),
    };

    redis = {
      set: jest.fn(),
      get: jest.fn(),
      del: jest.fn(),
    };

    controller = new AuthController(
      authService as unknown as AuthService,
      passkeyAuthService as unknown as PasskeyAuthService,
      fluxaOAuthService as unknown as FluxaOAuthService,
      configService as unknown as ConfigService,
      redis as never,
    );
  });

  describe('clientAddress helper', () => {
    it('returns req.ip when present', () => {
      const req = createMockRequest({ ip: '192.168.1.100' });
      expect(clientAddress(req)).toBe('192.168.1.100');
    });

    it('returns undefined when req.ip is null or undefined', () => {
      const req = { headers: {} } as unknown as FastifyRequest;
      expect(clientAddress(req)).toBeUndefined();
    });
  });

  describe('guard metadata', () => {
    it('applies JwtAuthGuard to protected routes', () => {
      const routesWithJwt = [
        'listSessions',
        'revokeSession',
        'listConnectedAccounts',
        'beginFluxaConnect',
        'fluxaCallback',
        'disconnectProvider',
        'me',
        'reauthenticate',
        'beginPasskeyRegistration',
        'verifyPasskeyRegistration',
        'listPasskeys',
        'renamePasskey',
        'revokePasskey',
      ] as const;

      for (const route of routesWithJwt) {
        const guards = Reflect.getMetadata('__guards__', controller[route]);
        expect(guards).toBeDefined();
        expect(guards).toContain(JwtAuthGuard);
      }
    });

    it('applies OptionalJwtAuthGuard to fluxa endpoint', () => {
      const guards = Reflect.getMetadata('__guards__', controller.fluxa);
      expect(guards).toBeDefined();
      expect(guards).toContain(OptionalJwtAuthGuard);
    });
  });

  describe('cookie handling', () => {
    it('sets cookies with secure=false when NODE_ENV is not production', async () => {
      configService.get = jest.fn().mockReturnValue('development');
      authService.login = jest.fn().mockResolvedValue({ user: mockUser, tokens: mockTokens });

      const reply = createMockReply();
      const req = createMockRequest();

      await controller.login({ email: 'test@example.com', password: 'password123' }, req, reply);

      expect(reply.setCookie).toHaveBeenCalledWith(
        ACCESS_TOKEN_COOKIE,
        mockTokens.accessToken,
        expect.objectContaining({
          httpOnly: true,
          secure: false,
          sameSite: 'lax',
          path: '/',
          maxAge: ACCESS_TOKEN_TTL_SECONDS,
        }),
      );
      expect(reply.setCookie).toHaveBeenCalledWith(
        REFRESH_TOKEN_COOKIE,
        mockTokens.refreshToken,
        expect.objectContaining({
          httpOnly: true,
          secure: false,
          sameSite: 'lax',
          path: '/',
          maxAge: REFRESH_TOKEN_TTL_SECONDS,
        }),
      );
    });

    it('sets cookies with secure=true when NODE_ENV is production', async () => {
      configService.get = jest.fn().mockReturnValue('production');
      authService.login = jest.fn().mockResolvedValue({ user: mockUser, tokens: mockTokens });

      const reply = createMockReply();
      const req = createMockRequest();

      await controller.login({ email: 'test@example.com', password: 'password123' }, req, reply);

      expect(reply.setCookie).toHaveBeenCalledWith(
        ACCESS_TOKEN_COOKIE,
        mockTokens.accessToken,
        expect.objectContaining({
          secure: true,
        }),
      );
      expect(reply.setCookie).toHaveBeenCalledWith(
        REFRESH_TOKEN_COOKIE,
        mockTokens.refreshToken,
        expect.objectContaining({
          secure: true,
        }),
      );
    });

    it('clears auth cookies on logout', async () => {
      authService.logout = jest.fn().mockResolvedValue(undefined);
      const reply = createMockReply();
      const req = createMockRequest({
        cookies: { [REFRESH_TOKEN_COOKIE]: 'active-refresh-token' },
      });

      const result = await controller.logout(req, reply);

      expect(authService.logout).toHaveBeenCalledWith('active-refresh-token');
      expect(reply.clearCookie).toHaveBeenCalledWith(ACCESS_TOKEN_COOKIE, { path: '/' });
      expect(reply.clearCookie).toHaveBeenCalledWith(REFRESH_TOKEN_COOKIE, { path: '/' });
      expect(result).toEqual({ success: true });
    });

    it('clears auth cookies and returns authenticated:false when refresh cookie is missing', async () => {
      const reply = createMockReply();
      const req = createMockRequest({ cookies: {} });

      const result = await controller.refresh(req, reply);

      expect(authService.refresh).not.toHaveBeenCalled();
      expect(reply.clearCookie).toHaveBeenCalledWith(ACCESS_TOKEN_COOKIE, { path: '/' });
      expect(reply.clearCookie).toHaveBeenCalledWith(REFRESH_TOKEN_COOKIE, { path: '/' });
      expect(result).toEqual({ authenticated: false });
    });
  });

  describe('registration & verification', () => {
    it('register delegates to authService.register and returns result', async () => {
      const dto = { email: 'new@example.com', password: 'Password123!' };
      const expected = { message: 'Verification email sent' };
      authService.register = jest.fn().mockResolvedValue(expected);

      const result = await controller.register(dto);

      expect(authService.register).toHaveBeenCalledWith(dto);
      expect(result).toEqual(expected);
    });

    it('register propagates ConflictException on duplicate email', async () => {
      const dto = { email: 'taken@example.com', password: 'Password123!' };
      authService.register = jest
        .fn()
        .mockRejectedValue(new ConflictException('Email already in use'));

      await expect(controller.register(dto)).rejects.toThrow(ConflictException);
    });

    it('verifyEmail delegates to authService.verifyEmail and sets cookies', async () => {
      const dto = { token: 'verify-token-123' };
      authService.verifyEmail = jest.fn().mockResolvedValue({
        user: mockUser,
        tokens: mockTokens,
      });
      const reply = createMockReply();

      const result = await controller.verifyEmail(dto, reply);

      expect(authService.verifyEmail).toHaveBeenCalledWith(dto.token);
      expect(reply.setCookie).toHaveBeenCalledTimes(2);
      expect(result).toEqual({
        user: {
          id: mockUser.id,
          email: mockUser.email,
          emailVerified: mockUser.emailVerified,
        },
      });
    });

    it('verifyEmail propagates GoneException when token is expired', async () => {
      const dto = { token: 'expired-token' };
      authService.verifyEmail = jest.fn().mockRejectedValue(new GoneException('TOKEN_EXPIRED'));
      const reply = createMockReply();

      await expect(controller.verifyEmail(dto, reply)).rejects.toThrow(GoneException);
    });
  });

  describe('login', () => {
    it('login delegates to authService.login, passes client metadata, sets cookies, and returns user', async () => {
      const dto = { email: 'user@example.com', password: 'Password123!' };
      authService.login = jest.fn().mockResolvedValue({
        user: mockUser,
        tokens: mockTokens,
      });
      const reply = createMockReply();
      const req = createMockRequest({
        ip: '10.0.0.42',
        userAgent: 'custom-browser/1.0',
      });

      const result = await controller.login(dto, req, reply);

      expect(authService.login).toHaveBeenCalledWith(dto, {
        ipAddress: '10.0.0.42',
        userAgent: 'custom-browser/1.0',
      });
      expect(reply.setCookie).toHaveBeenCalledTimes(2);
      expect(result).toEqual({
        user: {
          id: mockUser.id,
          email: mockUser.email,
          emailVerified: mockUser.emailVerified,
          fluxaTenantId: mockUser.fluxaTenantId,
        },
      });
    });

    it('login propagates UnauthorizedException on invalid credentials', async () => {
      const dto = { email: 'user@example.com', password: 'wrong' };
      authService.login = jest
        .fn()
        .mockRejectedValue(new UnauthorizedException('Invalid credentials'));
      const reply = createMockReply();
      const req = createMockRequest();

      await expect(controller.login(dto, req, reply)).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('password reset', () => {
    it('forgotPassword delegates to authService.requestPasswordReset with clientAddress', async () => {
      const dto = { email: 'reset@example.com' };
      const expected = { message: 'If the email exists, a reset link was sent' };
      authService.requestPasswordReset = jest.fn().mockResolvedValue(expected);
      const req = createMockRequest({ ip: '192.168.0.5' });

      const result = await controller.forgotPassword(dto, req);

      expect(authService.requestPasswordReset).toHaveBeenCalledWith(dto.email, '192.168.0.5');
      expect(result).toEqual(expected);
    });

    it('resetPassword delegates to authService.resetPassword', async () => {
      const dto = { token: 'reset-token', password: 'NewPassword123!' };
      const expected = { message: 'Password reset successfully' };
      authService.resetPassword = jest.fn().mockResolvedValue(expected);

      const result = await controller.resetPassword(dto);

      expect(authService.resetPassword).toHaveBeenCalledWith(dto.token, dto.password);
      expect(result).toEqual(expected);
    });

    it('resetPassword propagates GoneException when reset token is expired', async () => {
      const dto = { token: 'expired-reset-token', password: 'NewPassword123!' };
      authService.resetPassword = jest
        .fn()
        .mockRejectedValue(new GoneException('RESET_TOKEN_EXPIRED'));

      await expect(controller.resetPassword(dto)).rejects.toThrow(GoneException);
    });
  });

  describe('refresh', () => {
    it('rotates tokens and sets new cookies when valid refresh token is present', async () => {
      authService.refresh = jest.fn().mockResolvedValue({
        user: mockUser,
        tokens: {
          accessToken: 'new-access-token',
          refreshToken: 'new-refresh-token',
        },
      });
      const reply = createMockReply();
      const req = createMockRequest({
        ip: '172.16.0.1',
        userAgent: 'chrome/120',
        cookies: { [REFRESH_TOKEN_COOKIE]: 'old-refresh-token' },
      });

      const result = await controller.refresh(req, reply);

      expect(authService.refresh).toHaveBeenCalledWith('old-refresh-token', {
        ipAddress: '172.16.0.1',
        userAgent: 'chrome/120',
      });
      expect(reply.setCookie).toHaveBeenCalledWith(
        ACCESS_TOKEN_COOKIE,
        'new-access-token',
        expect.any(Object),
      );
      expect(reply.setCookie).toHaveBeenCalledWith(
        REFRESH_TOKEN_COOKIE,
        'new-refresh-token',
        expect.any(Object),
      );
      expect(result).toEqual({
        user: {
          id: mockUser.id,
          email: mockUser.email,
          emailVerified: mockUser.emailVerified,
          fluxaTenantId: mockUser.fluxaTenantId,
        },
      });
    });

    it('propagates UnauthorizedException when refresh token is invalid or revoked', async () => {
      authService.refresh = jest
        .fn()
        .mockRejectedValue(new UnauthorizedException('INVALID_REFRESH_TOKEN'));
      const reply = createMockReply();
      const req = createMockRequest({
        cookies: { [REFRESH_TOKEN_COOKIE]: 'revoked-token' },
      });

      await expect(controller.refresh(req, reply)).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('sessions', () => {
    it('listSessions maps session entities to response payload', async () => {
      const sessions = [
        {
          id: 's-1',
          ipAddress: '10.0.0.1',
          userAgent: 'agent-1',
          createdAt: new Date('2026-01-01'),
          expiresAt: new Date('2026-01-08'),
          tokenHash: 'hash-1',
          userId: mockUser.id,
        },
      ];
      authService.listSessions = jest.fn().mockResolvedValue(sessions as never);

      const result = await controller.listSessions({ id: mockUser.id });

      expect(authService.listSessions).toHaveBeenCalledWith(mockUser.id);
      expect(result).toEqual([
        {
          id: 's-1',
          ipAddress: '10.0.0.1',
          userAgent: 'agent-1',
          createdAt: new Date('2026-01-01'),
          expiresAt: new Date('2026-01-08'),
        },
      ]);
    });

    it('revokeSession calls authService.revokeSession and returns success', async () => {
      authService.revokeSession = jest.fn().mockResolvedValue(undefined);

      const result = await controller.revokeSession('s-1', { id: mockUser.id });

      expect(authService.revokeSession).toHaveBeenCalledWith('s-1', mockUser.id);
      expect(result).toEqual({ success: true });
    });

    it('revokeSession propagates NotFoundException when session is missing', async () => {
      authService.revokeSession = jest
        .fn()
        .mockRejectedValue(new NotFoundException('Session not found'));

      await expect(controller.revokeSession('s-missing', { id: mockUser.id })).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('fluxa link and OAuth', () => {
    it('fluxa handles logged-in user link', async () => {
      authService.getUserById = jest.fn().mockResolvedValue(mockUser);
      fluxaOAuthService.fluxaLink = jest.fn().mockResolvedValue({
        user: mockUser,
        tokens: mockTokens,
      });
      const reply = createMockReply();
      const req = createMockRequest({
        user: { id: mockUser.id, email: mockUser.email },
        ip: '10.1.2.3',
        userAgent: 'fluxa-client',
      });

      const result = await controller.fluxa({ apiKey: 'fluxa-key' }, req, reply);

      expect(authService.getUserById).toHaveBeenCalledWith(mockUser.id);
      expect(fluxaOAuthService.fluxaLink).toHaveBeenCalledWith({ apiKey: 'fluxa-key' }, mockUser, {
        ipAddress: '10.1.2.3',
        userAgent: 'fluxa-client',
      });
      expect(reply.setCookie).toHaveBeenCalledTimes(2);
      expect(result).toEqual({
        user: {
          id: mockUser.id,
          email: mockUser.email,
          fluxaTenantId: mockUser.fluxaTenantId,
        },
      });
    });

    it('fluxa handles anonymous link when req.user is undefined', async () => {
      fluxaOAuthService.fluxaLink = jest.fn().mockResolvedValue({
        user: mockUser,
        tokens: mockTokens,
      });
      const reply = createMockReply();
      const req = createMockRequest({ user: undefined });

      const result = await controller.fluxa({ apiKey: 'fluxa-key' }, req, reply);

      expect(authService.getUserById).not.toHaveBeenCalled();
      expect(fluxaOAuthService.fluxaLink).toHaveBeenCalledWith(
        { apiKey: 'fluxa-key' },
        undefined,
        expect.any(Object),
      );
      expect(result).toEqual({
        user: {
          id: mockUser.id,
          email: mockUser.email,
          fluxaTenantId: mockUser.fluxaTenantId,
        },
      });
    });

    it('listConnectedAccounts calls fluxaOAuthService.listConnectedAccounts', async () => {
      const accounts = [{ id: 'ca-1', provider: 'fluxa', connectedAt: new Date() }];
      fluxaOAuthService.listConnectedAccounts = jest.fn().mockResolvedValue(accounts as never);

      const result = await controller.listConnectedAccounts({ id: mockUser.id });

      expect(fluxaOAuthService.listConnectedAccounts).toHaveBeenCalledWith(mockUser.id);
      expect(result).toEqual(accounts);
    });

    it('beginFluxaConnect delegates to fluxaOAuthService.beginFluxaConnect with redis', async () => {
      const redirect = { url: 'https://auth.fluxa.example.com/oauth' };
      fluxaOAuthService.beginFluxaConnect = jest.fn().mockResolvedValue(redirect);

      const result = await controller.beginFluxaConnect({ id: mockUser.id });

      expect(fluxaOAuthService.beginFluxaConnect).toHaveBeenCalledWith(mockUser.id, redis);
      expect(result).toEqual(redirect);
    });

    it('fluxaCallback completes oauth connection and returns account details', async () => {
      const account = { id: 'ca-1', provider: 'fluxa', connectedAt: new Date() };
      fluxaOAuthService.completeFluxaConnect = jest.fn().mockResolvedValue(account as never);
      const req = createMockRequest({
        query: { code: 'oauth-code', state: 'oauth-state' },
      }) as never;

      const result = await controller.fluxaCallback(req);

      expect(fluxaOAuthService.completeFluxaConnect).toHaveBeenCalledWith(
        'oauth-code',
        'oauth-state',
        redis,
      );
      expect(result).toEqual({
        id: account.id,
        provider: account.provider,
        connectedAt: account.connectedAt,
      });
    });

    it('disconnectProvider calls fluxaOAuthService.disconnectProvider and returns success', async () => {
      fluxaOAuthService.disconnectProvider = jest.fn().mockResolvedValue(undefined);

      const result = await controller.disconnectProvider('fluxa', { id: mockUser.id });

      expect(fluxaOAuthService.disconnectProvider).toHaveBeenCalledWith(mockUser.id, 'fluxa');
      expect(result).toEqual({ success: true });
    });
  });

  describe('me', () => {
    it('returns user profile when user exists', async () => {
      authService.getUserById = jest.fn().mockResolvedValue(mockUser);

      const result = await controller.me({ id: mockUser.id, email: mockUser.email });

      expect(authService.getUserById).toHaveBeenCalledWith(mockUser.id);
      expect(result).toEqual({
        user: {
          id: mockUser.id,
          email: mockUser.email,
          emailVerified: mockUser.emailVerified,
          fluxaTenantId: mockUser.fluxaTenantId,
        },
      });
    });

    it('returns user: null when user is not found in database', async () => {
      authService.getUserById = jest.fn().mockResolvedValue(null);

      const result = await controller.me({ id: 'ghost-id', email: 'ghost@example.com' });

      expect(authService.getUserById).toHaveBeenCalledWith('ghost-id');
      expect(result).toEqual({ user: null });
    });
  });

  describe('passkeys', () => {
    it('reauthenticate delegates to passkeyAuthService.requestPasskeyReauth', async () => {
      const grant = { reauthToken: 'reauth-grant-token', expiresAt: new Date() };
      passkeyAuthService.requestPasskeyReauth = jest.fn().mockResolvedValue(grant);

      const result = await controller.reauthenticate(
        { id: mockUser.id },
        { password: 'Password123!' },
      );

      expect(passkeyAuthService.requestPasskeyReauth).toHaveBeenCalledWith(mockUser.id, 'Password123!');
      expect(result).toEqual(grant);
    });

    it('beginPasskeyRegistration delegates to passkeyAuthService.beginPasskeyRegistration', async () => {
      const options = { challenge: 'passkey-challenge-string' };
      passkeyAuthService.beginPasskeyRegistration = jest.fn().mockResolvedValue(options as never);

      const result = await controller.beginPasskeyRegistration(
        { id: mockUser.id },
        { reauthToken: 'reauth-grant' },
      );

      expect(passkeyAuthService.beginPasskeyRegistration).toHaveBeenCalledWith(
        mockUser.id,
        'reauth-grant',
      );
      expect(result).toEqual(options);
    });

    it('verifyPasskeyRegistration stores credential and returns passkey summary', async () => {
      const credential = {
        id: 'pk-uuid-1',
        name: 'MacBook Touch ID',
        createdAt: new Date(),
      };
      passkeyAuthService.verifyPasskeyRegistration = jest.fn().mockResolvedValue(credential as never);

      const result = await controller.verifyPasskeyRegistration(
        { id: mockUser.id },
        {
          reauthToken: 'reauth-grant',
          name: 'MacBook Touch ID',
          registrationResponse: { id: 'cred-id' } as never,
          transports: ['internal'],
        },
      );

      expect(passkeyAuthService.verifyPasskeyRegistration).toHaveBeenCalledWith(
        mockUser.id,
        'reauth-grant',
        'MacBook Touch ID',
        { id: 'cred-id' },
        ['internal'],
      );
      expect(result).toEqual({ passkey: credential });
    });

    it('beginPasskeyLogin delegates to passkeyAuthService.beginPasskeyLogin with optional email', async () => {
      const options = { challenge: 'login-challenge' };
      passkeyAuthService.beginPasskeyLogin = jest.fn().mockResolvedValue(options as never);

      const result = await controller.beginPasskeyLogin({ email: 'user@example.com' });

      expect(passkeyAuthService.beginPasskeyLogin).toHaveBeenCalledWith('user@example.com');
      expect(result).toEqual(options);
    });

    it('verifyPasskeyLogin validates assertion, sets auth cookies, and returns user', async () => {
      passkeyAuthService.verifyPasskeyLogin = jest.fn().mockResolvedValue({
        user: mockUser,
        tokens: mockTokens,
      });
      const reply = createMockReply();
      const req = createMockRequest({
        ip: '192.168.1.50',
        userAgent: 'passkey-agent',
      });

      const result = await controller.verifyPasskeyLogin(
        { assertionResponse: { id: 'assert-id' } as never },
        req,
        reply,
      );

      expect(passkeyAuthService.verifyPasskeyLogin).toHaveBeenCalledWith(
        { id: 'assert-id' },
        {
          ipAddress: '192.168.1.50',
          userAgent: 'passkey-agent',
        },
      );
      expect(reply.setCookie).toHaveBeenCalledTimes(2);
      expect(result).toEqual({
        user: {
          id: mockUser.id,
          email: mockUser.email,
          emailVerified: mockUser.emailVerified,
          fluxaTenantId: mockUser.fluxaTenantId,
        },
      });
    });

    it('listPasskeys delegates to passkeyAuthService.listPasskeys', async () => {
      const passkeys = [{ id: 'pk-1', name: 'YubiKey', createdAt: new Date() }];
      passkeyAuthService.listPasskeys = jest.fn().mockResolvedValue(passkeys as never);

      const result = await controller.listPasskeys({ id: mockUser.id });

      expect(passkeyAuthService.listPasskeys).toHaveBeenCalledWith(mockUser.id);
      expect(result).toEqual(passkeys);
    });

    it('renamePasskey delegates to passkeyAuthService.renamePasskey', async () => {
      passkeyAuthService.renamePasskey = jest.fn().mockResolvedValue(undefined);

      const result = await controller.renamePasskey(
        'pk-1',
        { id: mockUser.id },
        { name: 'New Name', reauthToken: 'reauth-grant' },
      );

      expect(passkeyAuthService.renamePasskey).toHaveBeenCalledWith(
        'pk-1',
        mockUser.id,
        'New Name',
        'reauth-grant',
      );
      expect(result).toEqual({ success: true });
    });

    it('revokePasskey delegates to passkeyAuthService.revokePasskey', async () => {
      passkeyAuthService.revokePasskey = jest.fn().mockResolvedValue(undefined);

      const result = await controller.revokePasskey(
        'pk-1',
        { id: mockUser.id },
        { reauthToken: 'reauth-grant' },
      );

      expect(passkeyAuthService.revokePasskey).toHaveBeenCalledWith('pk-1', mockUser.id, 'reauth-grant');
      expect(result).toEqual({ success: true });
    });
  });
});
