import { MigrationInterface, QueryRunner } from 'typeorm';
import { CreateGraphSnapshots1785600000000 } from './1785600000000-create-graph-snapshots';

/**
 * `graph_snapshots` was created by CreateGraphSnapshots1785600000000 but never
 * had an entity or a writer (#260): no code stored or read a snapshot, and the
 * table has no `network` column, so it could not key a testnet/mainnet cache
 * as designed. The traversal is now bounded per request instead, so the table
 * is dropped. `down` restores it exactly by re-running the original migration.
 */
export class DropGraphSnapshots1786500000000 implements MigrationInterface {
  name = 'DropGraphSnapshots1786500000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_graph_snapshots_root"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_graph_snapshots_user_created"');
    await queryRunner.query('DROP TABLE IF EXISTS "graph_snapshots"');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await new CreateGraphSnapshots1785600000000().up(queryRunner);
  }
}
