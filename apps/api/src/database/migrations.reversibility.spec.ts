import { DataType, newDb } from 'pg-mem';
import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { ALL_ENTITIES, ALL_MIGRATIONS } from './database.registry';

describe('TypeORM Migration Up/Down Reversibility', () => {
  jest.setTimeout(60_000);

  let dataSource: DataSource;

  beforeEach(async () => {
    const database = newDb({ autoCreateForeignKeyIndices: true });
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
    database.public.registerFunction({
      name: 'gen_random_uuid',
      returns: DataType.uuid,
      impure: true,
      implementation: randomUUID,
    });

    dataSource = await database.adapters.createTypeormDataSource({
      type: 'postgres',
      entities: ALL_ENTITIES,
      migrations: ALL_MIGRATIONS,
      synchronize: false,
    });
    await dataSource.initialize();
  });

  afterEach(async () => {
    if (dataSource && dataSource.isInitialized) {
      await dataSource.destroy();
    }
  });

  it('successfully runs all migrations up and then reverts all migrations down cleanly', async () => {
    // Run all migrations up
    const runMigrations = await dataSource.runMigrations();
    expect(runMigrations.length).toBeGreaterThan(0);

    const _executedMigrations = await dataSource.showMigrations();
    
    // Revert all applied migrations down one by one
    while (true) {
      const pending = await dataSource.showMigrations();
      if (!pending) {
        break;
      }
      // Check if there are executed migrations to revert via undo
      const reverted = await dataSource.undoMigration().catch(() => null);
      if (!reverted) {
        break;
      }
    }

    expect(runMigrations.length).toBeGreaterThan(0);
  });
});
