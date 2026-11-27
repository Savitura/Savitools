import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { JwtAuthGuard } from './jwt-auth.guard';
import { ACCESS_TOKEN_COOKIE } from '../auth.constants';

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;
  let jwtService: jest.Mocked<JwtService>;
  let configService: jest.Mocked<ConfigService>;

  beforeEach(() => {
    jwtService = {
      verify: jest.fn(),
    } as unknown as jest.Mocked<JwtService>;

    configService = {
      getOrThrow: jest.fn().mockReturnValue('test-jwt-secret'),
    } as unknown as jest.Mocked<ConfigService>;

    guard = new JwtAuthGuard(jwtService, configService);
  });

  function createMockContext(headers: Record<string, string> = {}, cookies: Record<string, string> = {}): ExecutionContext {
    const request = {
      headers,
      cookies,
    };
    return {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as unknown as ExecutionContext;
  }

  it('should allow request with valid Bearer token and set request.user', () => {
    const payload = { sub: 'user-123', email: 'test@example.com' };
    jwtService.verify.mockReturnValue(payload);

    const context = createMockContext({ authorization: 'Bearer valid.jwt.token' });
    const request = context.switchToHttp().getRequest() as any;

    const result = guard.canActivate(context);

    expect(result).toBe(true);
    expect(request.user).toEqual({ id: 'user-123', email: 'test@example.com' });
    expect(jwtService.verify).toHaveBeenCalledWith('valid.jwt.token', { secret: 'test-jwt-secret' });
  });

  it('should allow request with valid cookie token and set request.user', () => {
    const payload = { sub: 'user-456', email: 'cookie@example.com' };
    jwtService.verify.mockReturnValue(payload);

    const context = createMockContext({}, { [ACCESS_TOKEN_COOKIE]: 'valid.cookie.token' });
    const request = context.switchToHttp().getRequest() as any;

    const result = guard.canActivate(context);

    expect(result).toBe(true);
    expect(request.user).toEqual({ id: 'user-456', email: 'cookie@example.com' });
    expect(jwtService.verify).toHaveBeenCalledWith('valid.cookie.token', { secret: 'test-jwt-secret' });
  });

  it('should throw UnauthorizedException when no token is provided', () => {
    const context = createMockContext();

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
    expect(() => guard.canActivate(context)).toThrow('Authentication required');
  });

  it('should throw UnauthorizedException when token is expired or invalid', () => {
    jwtService.verify.mockImplementation(() => {
      throw new Error('TokenExpiredError');
    });

    const context = createMockContext({ authorization: 'Bearer expired.jwt.token' });

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
    expect(() => guard.canActivate(context)).toThrow('Invalid or expired token');
  });
});
