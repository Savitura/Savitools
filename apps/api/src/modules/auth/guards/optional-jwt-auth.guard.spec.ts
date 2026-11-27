import { ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { OptionalJwtAuthGuard } from './optional-jwt-auth.guard';
// ACCESS_TOKEN_COOKIE not used directly here

describe('OptionalJwtAuthGuard', () => {
  let guard: OptionalJwtAuthGuard;
  let jwtService: jest.Mocked<JwtService>;
  let configService: jest.Mocked<ConfigService>;

  beforeEach(() => {
    jwtService = {
      verify: jest.fn(),
    } as unknown as jest.Mocked<JwtService>;

    configService = {
      getOrThrow: jest.fn().mockReturnValue('test-jwt-secret'),
    } as unknown as jest.Mocked<ConfigService>;

    guard = new OptionalJwtAuthGuard(jwtService, configService);
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

  it('should allow request and set request.user when valid token is present', () => {
    const payload = { sub: 'user-789', email: 'opt@example.com' };
    jwtService.verify.mockReturnValue(payload);

    const context = createMockContext({ authorization: 'Bearer valid.jwt.token' });
    const request = context.switchToHttp().getRequest() as any;

    const result = guard.canActivate(context);

    expect(result).toBe(true);
    expect(request.user).toEqual({ id: 'user-789', email: 'opt@example.com' });
  });

  it('should allow request and keep request.user undefined when no token is present', () => {
    const context = createMockContext();
    const request = context.switchToHttp().getRequest() as any;

    const result = guard.canActivate(context);

    expect(result).toBe(true);
    expect(request.user).toBeUndefined();
    expect(jwtService.verify).not.toHaveBeenCalled();
  });

  it('should allow request and keep request.user undefined when token is invalid or expired', () => {
    jwtService.verify.mockImplementation(() => {
      throw new Error('Invalid token');
    });

    const context = createMockContext({ authorization: 'Bearer invalid.jwt.token' });
    const request = context.switchToHttp().getRequest() as any;

    const result = guard.canActivate(context);

    expect(result).toBe(true);
    expect(request.user).toBeUndefined();
  });
});
