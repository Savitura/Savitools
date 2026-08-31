import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateTransactionSequence1786000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "transaction_sequence_run" (
        "id" uuid PRIMARY KEY,
        "network" character varying NOT NULL,
        "stop_on_failure" boolean NOT NULL,
        "status" character varying NOT NULL,
        "steps" jsonb NOT NULL,
        "results" jsonb,
        "error" text,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT Now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT Now()
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "transaction_sequence_run"`);
  }
}
