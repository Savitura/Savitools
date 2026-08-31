import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateNetworkSamples1785786400000 implements MigrationInterface {
  name = "CreateNetworkSamples1785786400000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "network_samples" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "network" varchar(16) NOT NULL,
        "horizon_base_url" varchar NOT NULL,
        "ok" boolean NOT NULL,
        "latency_ms" integer,
        "error" text,
        "sampled_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_network_samples_network_sampled_at"
      ON "network_samples" ("network", "sampled_at")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_network_samples_sampled_at"
      ON "network_samples" ("sampled_at")
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_network_samples_sampled_at"',
    );
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_network_samples_network_sampled_at"',
    );
    await queryRunner.query('DROP TABLE IF EXISTS "network_samples"');
  }
}
