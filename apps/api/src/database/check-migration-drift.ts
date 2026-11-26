import defaultDataSource from './data-source';

export interface DriftQuery {
  query: string;
  parameters?: unknown[];
}

export interface DriftSchemaBuilder {
  log(): Promise<{ upQueries: DriftQuery[]; downQueries: DriftQuery[] }>;
}

export interface DriftDataSource {
  isInitialized: boolean;
  initialize(): Promise<unknown>;
  runMigrations(): Promise<Array<{ name: string }>>;
  destroy(): Promise<void>;
  driver: {
    createSchemaBuilder(): DriftSchemaBuilder;
  };
}

export interface CheckMigrationDriftOptions {
  dataSource?: DriftDataSource;
  runPendingMigrations?: boolean;
}

export interface DriftCheckResult {
  appliedMigrations: string[];
  upQueries: DriftQuery[];
  hasDrift: boolean;
}

export interface RunDriftCheckCliOptions extends CheckMigrationDriftOptions {
  log?: (message: string) => void;
  error?: (message: string) => void;
}

/**
 * Connect via `data-source.ts`, apply any pending migrations, and compute
 * TypeORM's in-memory schema diff without writing any migration files to disk.
 */
export async function checkMigrationDrift(
  options: CheckMigrationDriftOptions = {},
): Promise<DriftCheckResult> {
  const usingDefaultDataSource = !options.dataSource;
  if (usingDefaultDataSource && !process.env.DATABASE_URL?.trim()) {
    throw new Error('DATABASE_URL environment variable must be set to check migration drift.');
  }

  const dataSource: DriftDataSource = options.dataSource ?? defaultDataSource;
  const runPendingMigrations = options.runPendingMigrations ?? true;

  await dataSource.initialize();

  try {
    const appliedMigrations = runPendingMigrations
      ? (await dataSource.runMigrations()).map((migration) => migration.name)
      : [];

    const sqlInMemory = await dataSource.driver.createSchemaBuilder().log();
    const upQueries = sqlInMemory.upQueries;

    return {
      appliedMigrations,
      upQueries,
      hasDrift: upQueries.length > 0,
    };
  } finally {
    if (dataSource.isInitialized) {
      await dataSource.destroy();
    }
  }
}

/** Format pending schema-sync SQL statements for clear CI and local output. */
export function formatDriftReport(upQueries: DriftQuery[]): string {
  const lines = [
    `Entity-to-migration schema drift detected (${upQueries.length} pending SQL statement(s)):`,
    '',
  ];

  upQueries.forEach((entry, index) => {
    const sql = entry.query.trim();
    const terminated = sql.endsWith(';') ? sql : `${sql};`;
    lines.push(`${index + 1}. ${terminated}`);
    if (entry.parameters && entry.parameters.length > 0) {
      lines.push(`   params: ${JSON.stringify(entry.parameters)}`);
    }
  });

  lines.push(
    '',
    'To resolve this, add or generate a migration in apps/api/src/database/migrations/',
    'and register it in apps/api/src/database/database.registry.ts.',
  );

  return lines.join('\n');
}

/** CLI entrypoint returning an exit code (0 = clean, 1 = drift or error). */
export async function runDriftCheckCli(options: RunDriftCheckCliOptions = {}): Promise<number> {
  const log = options.log ?? console.log;
  const error = options.error ?? console.error;

  try {
    const result = await checkMigrationDrift({
      dataSource: options.dataSource,
      runPendingMigrations: options.runPendingMigrations,
    });

    if (result.appliedMigrations.length > 0) {
      log(
        `Applied ${result.appliedMigrations.length} pending migration(s): ${result.appliedMigrations.join(', ')}`,
      );
    }

    if (!result.hasDrift) {
      log('No entity-to-migration schema drift detected.');
      return 0;
    }

    error(formatDriftReport(result.upQueries));
    return 1;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    error(`Migration drift check failed: ${message}`);
    return 1;
  }
}

if (require.main === module) {
  const runPendingMigrations = !process.argv.includes('--no-run');
  void runDriftCheckCli({ runPendingMigrations }).then((exitCode) => {
    process.exit(exitCode);
  });
}
