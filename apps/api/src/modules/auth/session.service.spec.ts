import { createHash } from 'crypto';
import { ACCESS_TOKEN_TTL_SECONDS, REFRESH_TOKEN_TTL_SECONDS } from './auth.constants';
import { SessionService } from './session.service';
import { mockConfig, mockJwt, mockRepo } from './testing/auth-test-helpers';

describe('SessionService', () => {
  let service: SessionService;
  let refreshTokensRepo: ReturnType<typeof mockRepo>;
  let jwt: ReturnType<typeof mockJwt>;

  const user = { id: 'u1', email: 'a@b.com', emailVerified: true } as any;

  beforeEach(() => {
    refreshTokensRepo = mockRepo();
    jwt = mockJwt();
    service = new SessionService(refreshTokensRepo as any, jwt as any, mockConfig() as any);
  });

  it('signs an access token with the user claims and the access TTL', async () => {
    const { accessToken } = await service.issueSession(user, {});

    expect(accessToken).toBe('mock-access-token');
    expect(jwt.sign).toHaveBeenCalledWith(
      { sub: 'u1', email: 'a@b.com', emailVerified: true },
      { secret: 'test-secret', expiresIn: ACCESS_TOKEN_TTL_SECONDS },
    );
  });

  it('persists only the SHA-256 hash of the refresh token, with client metadata', async () => {
    const { refreshToken } = await service.issueSession(user, {
      ipAddress: '1.2.3.4',
      userAgent: 'jest',
    });

    const row = refreshTokensRepo.create.mock.calls[0][0] as Record<string, any>;
    expect(row.tokenHash).toBe(createHash('sha256').update(refreshToken).digest('hex'));
    expect(row.tokenHash).not.toBe(refreshToken);
    expect(row.ipAddress).toBe('1.2.3.4');
    expect(row.userAgent).toBe('jest');
    expect(row.revokedAt).toBeNull();
    const ttlMs = row.expiresAt.getTime() - Date.now();
    expect(ttlMs).toBeGreaterThan((REFRESH_TOKEN_TTL_SECONDS - 5) * 1000);
    expect(ttlMs).toBeLessThanOrEqual(REFRESH_TOKEN_TTL_SECONDS * 1000);
  });

  it('starts a new family unless one is supplied (rotation keeps the family)', async () => {
    await service.issueSession(user, {});
    await service.issueSession(user, {}, 'fam-1');

    const [fresh, rotated] = refreshTokensRepo.create.mock.calls.map(
      (c) => c[0] as Record<string, any>,
    );
    expect(fresh.familyId).toEqual(expect.any(String));
    expect(fresh.familyId).not.toBe('fam-1');
    expect(rotated.familyId).toBe('fam-1');
  });
});
