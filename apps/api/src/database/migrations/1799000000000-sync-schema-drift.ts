import { MigrationInterface, QueryRunner } from 'typeorm';

export class SyncSchemaDrift1799000000000 implements MigrationInterface {
  name = 'SyncSchemaDrift1799000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "passkeys" DROP CONSTRAINT IF EXISTS "FK_passkeys_user_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "watched_pools" DROP CONSTRAINT IF EXISTS "FK_watched_pools_user_id"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."UQ_connected_accounts_user_provider"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_connected_accounts_user"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_refresh_tokens_family"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_refresh_tokens_token_hash_active"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_vault_keys_user"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_vault_keys_user_provider"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."UQ_users_email_verification_token"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_passkeys_user_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_playground_history_user_created"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_transaction_replays_user_created"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IDX_network_samples_network_sampled_at"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_network_samples_sampled_at"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_network_profiles_owner_name"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_horizon_replay_userId"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_horizon_replay_workspaceId"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_horizon_replay_network"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_horizon_replay_createdAt"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_horizon_replay_transactionHash"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_watched_pools_user_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_watched_pools_pool_network"`);
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "monitor_digest_preferences" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" character varying NOT NULL, "digest_enabled" boolean NOT NULL DEFAULT false, "digest_interval_minutes" integer NOT NULL DEFAULT '60', "timezone" character varying(64) NOT NULL DEFAULT 'UTC', "quiet_hours_enabled" boolean NOT NULL DEFAULT false, "quiet_hours_start" character varying(8) NOT NULL DEFAULT '22:00', "quiet_hours_end" character varying(8) NOT NULL DEFAULT '08:00', "max_digest_alerts" integer NOT NULL DEFAULT '25', "last_digest_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_1a67be05b0a3c267b1f3589c6f5" UNIQUE ("user_id"), CONSTRAINT "PK_d8de851539901222864f44d5974" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "api_keys" ADD COLUMN IF NOT EXISTS "key_preview" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "alert_events" ADD COLUMN IF NOT EXISTS "claimed_at" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `ALTER TABLE "alert_events" ADD COLUMN IF NOT EXISTS "claimed_by" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "alert_events" ADD COLUMN IF NOT EXISTS "claim_key" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "network_samples" ADD COLUMN IF NOT EXISTS "ok_status" boolean NOT NULL DEFAULT true`,
    );
    await queryRunner.query(`ALTER TABLE "refresh_tokens" ALTER COLUMN "family_id" DROP DEFAULT`);
    await queryRunner.query(
      `ALTER TABLE "watches" ALTER COLUMN "event_types" SET DEFAULT '["transaction","payment"]'::jsonb`,
    );
    await queryRunner.query(
      `ALTER TABLE "watches" ALTER COLUMN "alert_rules" SET DEFAULT '[]'::jsonb`,
    );
    await queryRunner.query(
      `ALTER TABLE "watches" ALTER COLUMN "alert_state" SET DEFAULT '{}'::jsonb`,
    );
    await queryRunner.query(
      `ALTER TABLE "alert_events" ALTER COLUMN "delivery_attempts" SET DEFAULT '[]'::jsonb`,
    );
    await queryRunner.query(`ALTER TABLE "watched_pools" DROP COLUMN IF EXISTS "user_id"`);
    await queryRunner.query(
      `ALTER TABLE "watched_pools" ADD COLUMN IF NOT EXISTS "user_id" character varying NOT NULL`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IDX_ledger_close_stats_network_sampled_at"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_ledger_close_stats_sampled_at"`);
    await queryRunner.query(`ALTER TABLE "ledger_close_stats" DROP COLUMN IF EXISTS "sampled_at"`);
    await queryRunner.query(
      `ALTER TABLE "ledger_close_stats" ADD COLUMN IF NOT EXISTS "sampled_at" TIMESTAMP NOT NULL DEFAULT now()`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_b954de63f16bc013e4f72ce557" ON "network_samples" ("network", "ok_status", "sampled_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_98e7b5521fe15daf951cb552e8" ON "horizon_replay_history" ("userId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_cb9b518920b34f60342d41b00a" ON "horizon_replay_history" ("workspaceId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_9f680845bd7fd88f110997e9dc" ON "horizon_replay_history" ("network")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_527aa4bca3fff547c98991af33" ON "horizon_replay_history" ("createdAt")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_5563f6121efe7b2e4b76a63066" ON "horizon_replay_history" ("transactionHash")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_a654f74e113cbd9c1f96dffbd8" ON "watched_pools" ("user_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_e7f7c3b526bbf38b74fc07bac3" ON "watched_pools" ("pool_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_ledger_close_stats_sampled_at" ON "ledger_close_stats" ("sampled_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_ledger_close_stats_network_sampled_at" ON "ledger_close_stats" ("network", "sampled_at")`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "monitor_digest_preferences"`);
  }
}
