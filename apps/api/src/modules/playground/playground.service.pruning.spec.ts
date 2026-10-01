import { DataType, IMemoryDb, newDb } from 'pg-mem';
import { randomUUID } from 'crypto';
import { DataSource, Repository } from 'typeorm';
import { User } from '../auth/entities/user.entity';
import { RefreshToken } from '../auth/entities/refresh-token.entity';
import { ConnectedAccount } from '../auth/entities/connected-account.entity';
import { VaultKey } from '../auth/entities/vault-key.entity';
import { Workspace } from '../workspace/entities/workspace.entity';
import { ApiKey, ApiKeyProvider } from './entities/api-key.entity';
import { PlaygroundHistory } from './entities/playground-history.entity';
import {
  DEFAULT_SPEC_TTL_MS,
  PLAYGROUND_HISTORY_LIMIT,
  parseSpecTtlMs,
  prunePlaygroundHistory,
} from './playground.service';

const BASE_MS = Date.UTC(2026, 0, 1);

describe('parseSpecTtlMs (Savitura/Savitools#247)', () => {
  it('falls back to the default when unset', () => {
    expect(parseSpecTtlMs(undefined)).toBe(DEFAULT_SPEC_TTL_MS);
    expect(parseSpecTtlMs(null)).toBe(DEFAULT_SPEC_TTL_MS);
    expect(parseSpecTtlMs('')).toBe(DEFAULT_SPEC_TTL_MS);
  });

  it('parses numeric strings (env values are strings)', () => {
    expect(parseSpecTtlMs('2500')).toBe(2500);
  });

  it('accepts a number unchanged', () => {
    expect(parseSpecTtlMs(1000)).toBe(1000);
  });

  it.each(['abc', '0', '-5', '1.5', 'NaN', '1e3'])(
    'rejects invalid value %s instead of producing NaN',
    (value) => {
      expect(() => parseSpecTtlMs(value)).toThrow(/PLAYGROUND_SPEC_TTL_MS/);
    },
  );
});

describe('prunePlaygroundHistory (Savitura/Savitools#247)', () => {
  let database: IMemoryDb;
  let dataSource: DataSource;
  let repository: Repository<PlaygroundHistory>;
  let userId: string;

  beforeEach(async () => {
    database = newDb({ autoCreateForeignKeyIndices: true });
    database.public.registerFunction({
      name: 'current_database',
      returns: DataType.text,
      implementation: () => 'savitools_test',
    });
    database.public.registerFunction({
      name: 'version',
      returns: DataType.text,
      implementation: () => 'PostgreSQL 16',
    });
    database.public.registerFunction({
      name: 'uuid_generate_v4',
      returns: DataType.uuid,
      impure: true,
      implementation: randomUUID,
    });
    dataSource = await database.adapters.createTypeormDataSource({
      type: 'postgres',
      entities: [
        User,
        RefreshToken,
        ConnectedAccount,
        VaultKey,
        Workspace,
        ApiKey,
        PlaygroundHistory,
      ],
      synchronize: true,
    });
    await dataSource.initialize();
    repository = dataSource.getRepository(PlaygroundHistory);

    const user = await dataSource.getRepository(User).save({
      email: 'prune@example.com',
      passwordHash: null,
      fluxaTenantId: null,
    });
    userId = user.id;
  });

  afterEach(async () => {
    await dataSource.destroy();
  });

  async function createUser(email: string): Promise<string> {
    const user = await dataSource.getRepository(User).save({
      email,
      passwordHash: null,
      fluxaTenantId: null,
    });
    return user.id;
  }

  async function seed(ownerId: string, count: number): Promise<void> {
    for (let i = 0; i < count; i += 1) {
      await repository.insert({
        userId: ownerId,
        provider: ApiKeyProvider.CUSTOM,
        method: 'GET',
        path: `/p/${i}`,
        query: null,
        requestHeaders: null,
        responseStatus: 200,
        responseHeaders: {},
        latencyMs: i,
        createdAt: new Date(BASE_MS + i * 1000),
      });
    }
  }

  async function timestamps(ownerId: string): Promise<number[]> {
    const rows = await repository.find({
      where: { userId: ownerId },
      order: { createdAt: 'ASC' },
    });
    return rows.map((row) => new Date(row.createdAt).getTime());
  }

  it('keeps exactly the newest 50 entries', async () => {
    await seed(userId, 60);

    const deleted = await prunePlaygroundHistory(repository, userId);

    expect(deleted).toBe(10);
    const kept = await timestamps(userId);
    expect(kept).toHaveLength(PLAYGROUND_HISTORY_LIMIT);
    // The newest 50 are the last 50 inserted (indices 10..59).
    expect(kept[0]).toBe(BASE_MS + 10 * 1000);
    expect(kept[kept.length - 1]).toBe(BASE_MS + 59 * 1000);
  });

  it('does not delete when a user has fewer than 50 entries', async () => {
    await seed(userId, 49);

    const deleted = await prunePlaygroundHistory(repository, userId);

    expect(deleted).toBe(0);
    expect(await repository.count({ where: { userId } })).toBe(49);
  });

  it('does not delete when a user has exactly 50 entries', async () => {
    await seed(userId, 50);

    const deleted = await prunePlaygroundHistory(repository, userId);

    expect(deleted).toBe(0);
    expect(await repository.count({ where: { userId } })).toBe(50);
  });

  it('only prunes the requested user', async () => {
    const otherUser = await createUser('other@example.com');
    await seed(userId, 60);
    await seed(otherUser, 60);

    await prunePlaygroundHistory(repository, userId);

    expect(await repository.count({ where: { userId } })).toBe(50);
    expect(await repository.count({ where: { userId: otherUser } })).toBe(60);
  });
});
