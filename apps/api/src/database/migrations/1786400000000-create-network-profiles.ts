import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Custom network profiles (Savitura/Savitools#172).
 *
 * Previously this table was created as an unrelated side effect of the
 * transaction-sequence migration, so the schema did not match the
 * `NetworkProfile` entity. It now lives in its own migration.
 */
export class CreateNetworkProfiles1786400000000 implements MigrationInterface {
  name = 'CreateNetworkProfiles1786400000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "network_profiles" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "owner_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "name" varchar(120) NOT NULL,
        "horizon_url" varchar NOT NULL,
        "network_passphrase" varchar NOT NULL,
        "friendbot_url" varchar,
        "is_default" boolean NOT NULL DEFAULT false,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_network_profiles_owner_name"
      ON "network_profiles" ("owner_id", "name")
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_network_profiles_owner_name"',
    );
    await queryRunner.query('DROP TABLE IF EXISTS "network_profiles"');
  }
}
