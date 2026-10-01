import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Enforces "at most one default (unnamed) workspace per user per tool".
 *
 * `@Unique(['userId', 'tool', 'name'])` cannot express this: PostgreSQL treats
 * NULL values as distinct in a unique index, so any number of `name IS NULL`
 * rows could be inserted for the same (user_id, tool). A partial unique index
 * is the tool PostgreSQL provides for exactly this case.
 *
 * Rows that already violate the invariant are folded into the oldest row for
 * their (user_id, tool) group before the index is created, otherwise the index
 * creation itself would fail on a database that already has duplicates.
 */
export class WorkspaceDefaultUniqueIndex1786400000000 implements MigrationInterface {
  name = "WorkspaceDefaultUniqueIndex1786400000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    // Keep the earliest default workspace per (user_id, tool); delete the rest.
    await queryRunner.query(`
      DELETE FROM "workspaces" AS w
      USING "workspaces" AS keep
      WHERE w."name" IS NULL
        AND keep."name" IS NULL
        AND w."user_id" = keep."user_id"
        AND w."tool" = keep."tool"
        AND w."id" <> keep."id"
        AND (
          w."created_at" > keep."created_at"
          OR (w."created_at" = keep."created_at" AND w."id" > keep."id")
        )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_workspaces_user_tool_default"
      ON "workspaces" ("user_id", "tool")
      WHERE "name" IS NULL
    `);

    // The composite unique leads with user_id but only for non-NULL names, and
    // every workspace lookup is scoped by user_id.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_workspaces_user_id"
      ON "workspaces" ("user_id")
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_workspaces_user_id"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "UQ_workspaces_user_tool_default"`,
    );
  }
}
