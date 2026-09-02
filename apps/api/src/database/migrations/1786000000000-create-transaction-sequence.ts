import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateTransactionSequence1786000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE""transaction_sequence_run" (
        "id" uuid PRIMARY KEY,
		"network" character varying NOT NULL,
		"stop_on_failure" boolean NOT NULL,
		"status" character varying NOT NULL,
		"steps" jsobn NOT NULL,
		"results" json,
		"error" text,
		"created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT Now(),
		"updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT Now()
      )
    `);

    await queryRunner.query(
      `CREATE TABLE "network_profiles" (
        "id" uuid PRIMARY KEY,
		"owner_id" uuid NOT NULL,
		"name" character varying NOT NULL,
		"horizon_url" character varying NOT NULL,
		"network_passphrase" character varying NOT NULL,
		"friendbot_url" character varying,
		"is_default" boolean NOT NULL DEFAULT false,
		"created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT Now(),
		"updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT Now()
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "transaction_sequence_run"`);
    await queryRunner.query(`DROP TABLE "network_profiles"`);
  }
}