import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Transaction sequence runs with automatic sequence numbers
 * (Savitura/Savitools#168).
 *
 * The original migration used a malformed `CREATE TABLE` statement and an
 * invalid `jsobn` column type, omitted the `user_id` column the entity
 * declares, and created the unrelated `network_profiles` table as a side
 * effect. The profile table moved to `CreateNetworkProfiles1786400000000`.
 */
export class CreateTransactionSequence1786000000000
  implements MigrationInterface
{
  name = 'CreateTransactionSequence1786000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "transaction_sequence_run" (
        "id" uuid PRIMARY KEY,
        "user_id" uuid REFERENCES "users"("id") ON DELETE CASCADE,
        "network" varchar NOT NULL,
        "stop_on_failure" boolean NOT NULL,
        "status" varchar NOT NULL,
        "steps" jsonb NOT NULL,
        "results" jsonb,
        "error" text,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS "transaction_sequence_run"');
  }
}
