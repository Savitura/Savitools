import { MigrationInterface, QueryRunner } from "typeorm";

export class AddToolPresetsWorkspace1792627200000 implements MigrationInterface {
  name = "AddToolPresetsWorkspace1792627200000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "workspaces_tool_enum" ADD VALUE IF NOT EXISTS 'tool-presets'`,
    );
  }

  async down(): Promise<void> {
    // PostgreSQL enum values are not safely removable in a reversible migration.
  }
}
