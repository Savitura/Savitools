import { checkMigrationDrift, DriftDataSource, runDriftCheckCli } from './check-migration-drift';

function createMockDataSource(options: {
  appliedMigrations?: Array<{ name: string }>;
  upQueries?: Array<{ query: string; parameters?: unknown[] }>;
  runMigrationsError?: Error;
  logError?: Error;
}): {
  dataSource: DriftDataSource;
  initialize: jest.Mock;
  runMigrations: jest.Mock;
  log: jest.Mock;
  destroy: jest.Mock;
} {
  const initialize = jest.fn(async () => {
    dataSource.isInitialized = true;
  });

  const runMigrations = jest.fn(async () => {
    if (options.runMigrationsError) {
      throw options.runMigrationsError;
    }
    return options.appliedMigrations ?? [];
  });

  const log = jest.fn(async () => {
    if (options.logError) {
      throw options.logError;
    }
    return {
      upQueries: options.upQueries ?? [],
      downQueries: [],
    };
  });

  const destroy = jest.fn(async () => {
    dataSource.isInitialized = false;
  });

  const dataSource: DriftDataSource = {
    isInitialized: false,
    initialize,
    runMigrations,
    destroy,
    driver: {
      createSchemaBuilder: () => ({ log }),
    },
  };

  return { dataSource, initialize, runMigrations, log, destroy };
}

describe('checkMigrationDrift', () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;

  afterEach(() => {
    if (originalDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = originalDatabaseUrl;
    }
  });

  it('throws a clear error when DATABASE_URL is missing and no custom dataSource is passed', async () => {
    delete process.env.DATABASE_URL;

    await expect(checkMigrationDrift()).rejects.toThrow(
      'DATABASE_URL environment variable must be set',
    );
  });

  it('runs migrations, checks schema diff, destroys data source, and reports zero drift', async () => {
    const mock = createMockDataSource({
      appliedMigrations: [{ name: 'CreateInitialSchema1500000000000' }],
      upQueries: [],
    });

    const result = await checkMigrationDrift({ dataSource: mock.dataSource });

    expect(mock.initialize).toHaveBeenCalledTimes(1);
    expect(mock.runMigrations).toHaveBeenCalledTimes(1);
    expect(mock.log).toHaveBeenCalledTimes(1);
    expect(mock.destroy).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      appliedMigrations: ['CreateInitialSchema1500000000000'],
      upQueries: [],
      hasDrift: false,
    });
  });

  it('reports drift with exact pending SQL queries when entity schema diverges', async () => {
    const upQueries = [
      { query: 'ALTER TABLE "users" ADD "nickname" character varying' },
      {
        query: 'CREATE INDEX "IDX_users_nickname" ON "users" ("nickname")',
        parameters: ['unused'],
      },
    ];
    const mock = createMockDataSource({ upQueries });

    const result = await checkMigrationDrift({ dataSource: mock.dataSource });

    expect(result.hasDrift).toBe(true);
    expect(result.upQueries).toEqual(upQueries);
    expect(mock.destroy).toHaveBeenCalledTimes(1);
  });

  it('skips running migrations when runPendingMigrations is false', async () => {
    const mock = createMockDataSource({ upQueries: [] });

    const result = await checkMigrationDrift({
      dataSource: mock.dataSource,
      runPendingMigrations: false,
    });

    expect(mock.runMigrations).not.toHaveBeenCalled();
    expect(result.appliedMigrations).toEqual([]);
    expect(result.hasDrift).toBe(false);
  });

  it('always destroys an initialized data source when schema diff fails', async () => {
    const mock = createMockDataSource({
      logError: new Error('schema introspection failed'),
    });

    await expect(checkMigrationDrift({ dataSource: mock.dataSource })).rejects.toThrow(
      'schema introspection failed',
    );
    expect(mock.destroy).toHaveBeenCalledTimes(1);
  });
});

describe('runDriftCheckCli', () => {
  it('returns exit code 0 and logs clean status when no drift is found', async () => {
    const mock = createMockDataSource({
      appliedMigrations: [{ name: 'AddApiKeyMaskedKey1790700000000' }],
      upQueries: [],
    });
    const stdout: string[] = [];
    const stderr: string[] = [];

    const code = await runDriftCheckCli({
      dataSource: mock.dataSource,
      log: (msg) => stdout.push(msg),
      error: (msg) => stderr.push(msg),
    });

    expect(code).toBe(0);
    expect(stderr).toEqual([]);
    expect(stdout.join('\n')).toContain('Applied 1 pending migration(s)');
    expect(stdout.join('\n')).toContain('No entity-to-migration schema drift detected.');
  });

  it('returns exit code 1 and prints the exact SQL diff when drift exists', async () => {
    const mock = createMockDataSource({
      upQueries: [{ query: 'ALTER TABLE "users" ADD "bio" text' }],
    });
    const stdout: string[] = [];
    const stderr: string[] = [];

    const code = await runDriftCheckCli({
      dataSource: mock.dataSource,
      log: (msg) => stdout.push(msg),
      error: (msg) => stderr.push(msg),
    });

    expect(code).toBe(1);
    const errText = stderr.join('\n');
    expect(errText).toContain('Entity-to-migration schema drift detected');
    expect(errText).toContain('ALTER TABLE "users" ADD "bio" text;');
    expect(errText).toContain('apps/api/src/database/migrations/');
    expect(errText).toContain('apps/api/src/database/database.registry.ts');
  });

  it('returns exit code 1 and logs error when drift check throws', async () => {
    const mock = createMockDataSource({
      runMigrationsError: new Error('connection refused'),
    });
    const stderr: string[] = [];

    const code = await runDriftCheckCli({
      dataSource: mock.dataSource,
      log: jest.fn(),
      error: (msg) => stderr.push(msg),
    });

    expect(code).toBe(1);
    expect(stderr.join('\n')).toContain('Migration drift check failed: connection refused');
  });
});
