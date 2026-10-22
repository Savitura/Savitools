import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateLedgerCloseStats1791000000000 implements MigrationInterface {
  name = 'CreateLedgerCloseStats1791000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "ledger_close_stats" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "network" varchar(16) NOT NULL,
        "ledger_sequence" bigint NOT NULL,
        "close_time" timestamptz NOT NULL,
        "close_time_seconds" numeric NOT NULL,
        "latency_ms" integer NOT NULL,
        "p50_latency_ms" integer,
        "p95_latency_ms" integer,
        "p99_latency_ms" integer,
        "transaction_count" integer,
        "operation_count" integer,
        "sampled_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_ledger_close_stats_network_sequence"
      ON "ledger_close_stats" ("network", "ledger_sequence" DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_ledger_close_stats_network_sampled_at"
      ON "ledger_close_stats" ("network", "sampled_at" DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_ledger_close_stats_sampled_at"
      ON "ledger_close_stats" ("sampled_at" DESC)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_ledger_close_stats_sampled_at"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_ledger_close_stats_network_sampled_at"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_ledger_close_stats_network_sequence"');
    await queryRunner.query('DROP TABLE IF EXISTS "ledger_close_stats"');
  }
}
