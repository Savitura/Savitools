import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateTransactionReplay1785700000000 implements MigrationInterface {
  name = 'CreateTransactionReplay1785700000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "transaction_replays" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "network" varchar(16) NOT NULL DEFAULT 'testnet',
        "original_hash" varchar(64) NOT NULL,
        "original_xdr" text NOT NULL,
        "original_details" jsonb,
        "modified_xdr" text NOT NULL,
        "modifications" jsonb NOT NULL,
        "simulation_result" jsonb NOT NULL,
        "submitted" boolean NOT NULL DEFAULT false,
        "submitted_hash" varchar(64),
        "submission_result" jsonb,
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_transaction_replays_user_created"
      ON "transaction_replays" ("user_id", "created_at" DESC)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS "transaction_replays"');
  }
}
