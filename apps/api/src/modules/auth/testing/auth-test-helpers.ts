import * as argon2 from 'argon2';

export function mockRepo() {
  return {
    findOne: jest.fn(),
    find: jest.fn(),
    create: jest.fn((dto: Record<string, unknown>): Record<string, unknown> => ({ id: 'uuid-1', ...dto })),
    save: jest.fn(async (entity: unknown) => entity),
    update: jest.fn(async () => ({ affected: 1 })),
    delete: jest.fn(async () => ({ affected: 1 })),
    remove: jest.fn(async (entity: unknown) => entity),
  };
}

/**
 * In-memory refresh_tokens table used to exercise the atomic
 * consume-and-rotate logic under real (single-process, event-loop)
 * concurrency, mirroring the WHERE revoked_at IS NULL semantics a
 * Postgres UPDATE would enforce at the row-lock level.
 */
export function fakeRefreshTokenTable(seed: Array<Record<string, unknown>>) {
  const rows = new Map<string, Record<string, unknown>>(
    seed.map((row) => [row.id as string, { ...row }]),
  );
  let counter = rows.size;

  return {
    _rows: rows,
    create: jest.fn((dto: Record<string, unknown>) => ({
      id: `rt-new-${++counter}`,
      revokedAt: null,
      ...dto,
    })),
    save: jest.fn(async (entity: Record<string, unknown>) => {
      rows.set(entity.id as string, entity);
      return entity;
    }),
    findOne: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
      for (const row of rows.values()) {
        if (where.id !== undefined && row.id !== where.id) continue;
        if (where.tokenHash !== undefined && row.tokenHash !== where.tokenHash) continue;
        return { ...row };
      }
      return null;
    }),
    // Simulates `UPDATE ... WHERE id = :id AND revoked_at IS NULL` (or a
    // family-wide revoke with no revokedAt condition) — synchronous
    // check-then-set, exactly like a single atomic SQL statement.
    update: jest.fn(
      async (
        criteria: { id?: string; familyId?: string; revokedAt?: unknown },
        partial: Record<string, unknown>,
      ) => {
        let affected = 0;
        for (const row of rows.values()) {
          if (criteria.id !== undefined && row.id !== criteria.id) continue;
          if (criteria.familyId !== undefined && row.familyId !== criteria.familyId) continue;
          if ('revokedAt' in criteria && row.revokedAt !== null) continue;
          Object.assign(row, partial);
          affected++;
        }
        return { affected };
      },
    ),
    delete: jest.fn(async () => ({ affected: 1 })),
    find: jest.fn(async () => Array.from(rows.values())),
  };
}

export function mockJwt() {
  return {
    sign: jest.fn(() => 'mock-access-token'),
    verify: jest.fn((token: string) => {
      if (token === 'mock-access-token' || token === 'mock-reauth-token') {
        return { sub: 'u-passkey', scope: 'passkey-reauth' };
      }
      // Minted reauth tokens: sign is stubbed to a constant, but tests pass
      // whatever requestPasskeyReauth returned — accept tokens signed for reauth.
      throw new Error('invalid token');
    }),
  };
}

export function mockConfig() {
  return {
    getOrThrow: jest.fn((key: string) => {
      if (key === 'JWT_SECRET') return 'test-secret';
      if (key === 'ENCRYPTION_SECRET') return 'test-encryption-secret-32-bytes!!';
      throw new Error(`Missing config key: ${key}`);
    }),
    get: jest.fn((key: string, defaultValue?: unknown) => {
      if (key === 'NODE_ENV') return 'test';
      if (key === 'RESEND_API_KEY') return undefined; // no email sending in tests
      return defaultValue ?? undefined;
    }),
  };
}

/** Argon2id hash of 'password123' at test-friendly cost; compute once per suite in beforeAll. */
export function hashTestPassword(password = 'password123'): Promise<string> {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 1024, // low cost for tests
    timeCost: 1,
    parallelism: 1,
  });
}

/** Production-flavoured config for fail-closed tests. */
export function mockProdConfig(overrides: Record<string, unknown> = {}) {
  return {
    getOrThrow: jest.fn((key: string) => {
      if (key === 'JWT_SECRET') return 'test-secret';
      if (key === 'ENCRYPTION_SECRET') return 'test-encryption-secret-32-bytes!!';
      throw new Error(`Missing config key: ${key}`);
    }),
    get: jest.fn((key: string, defaultValue?: unknown) => {
      if (key === 'NODE_ENV') return 'production';
      if (key in overrides) return overrides[key];
      return defaultValue ?? undefined;
    }),
  };
}
