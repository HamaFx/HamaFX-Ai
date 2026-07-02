-- Phase 3 Session A — multi-tenancy foundation (Migration A + backfill preparation)
--
-- Adds organization roots, nullable tenant_id columns, legacy-compatible
-- backfills, and trigger-based tenant inference so the existing single-user
-- app can keep writing rows while tenant IDs roll out.

CREATE TABLE "organization" (
  "id" text PRIMARY KEY,
  "name" text NOT NULL,
  "plan" text NOT NULL DEFAULT 'free',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "deleted_at" timestamptz
);
--> statement-breakpoint

CREATE TABLE "organization_member" (
  "org_id" text NOT NULL REFERENCES "organization"("id") ON DELETE CASCADE,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "role" text NOT NULL DEFAULT 'member',
  "added_at" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("org_id", "user_id")
);
--> statement-breakpoint

CREATE INDEX "organization_member_user_idx" ON "organization_member" ("user_id");
--> statement-breakpoint

CREATE OR REPLACE FUNCTION hamafx_resolve_tenant_id(p_user_id text)
RETURNS text
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN COALESCE(current_setting('app.current_tenant', true), p_user_id);
END;
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION hamafx_provision_personal_organization()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO "organization" ("id", "name", "created_at", "deleted_at")
  VALUES (
    NEW."id",
    COALESCE(
      NULLIF(NEW."name", ''),
      NULLIF(split_part(NEW."email", '@', 1), ''),
      'Personal workspace'
    ),
    COALESCE(NEW."createdAt", now()),
    NEW."deletedAt"
  )
  ON CONFLICT ("id") DO NOTHING;

  INSERT INTO "organization_member" ("org_id", "user_id", "role")
  VALUES (NEW."id", NEW."id", 'owner')
  ON CONFLICT ("org_id", "user_id") DO NOTHING;

  RETURN NEW;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER hamafx_user_personal_organization_after_insert
AFTER INSERT ON "user"
FOR EACH ROW
EXECUTE FUNCTION hamafx_provision_personal_organization();
--> statement-breakpoint

ALTER TABLE "agent_opinions" ADD COLUMN "tenant_id" text REFERENCES "organization"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "alerts" ADD COLUMN "tenant_id" text REFERENCES "organization"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "audit_logs" ADD COLUMN "tenant_id" text REFERENCES "organization"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "bot_links" ADD COLUMN "tenant_id" text REFERENCES "organization"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "briefings_emitted" ADD COLUMN "tenant_id" text REFERENCES "organization"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN "tenant_id" text REFERENCES "organization"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "chat_telemetry" ADD COLUMN "tenant_id" text REFERENCES "organization"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "chat_threads" ADD COLUMN "tenant_id" text REFERENCES "organization"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "chat_tool_telemetry" ADD COLUMN "tenant_id" text REFERENCES "organization"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "daily_ai_spend" ADD COLUMN "tenant_id" text REFERENCES "organization"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "decision_signal_feedback" ADD COLUMN "tenant_id" text REFERENCES "organization"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "decision_signal_outcomes" ADD COLUMN "tenant_id" text REFERENCES "organization"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "decision_signals" ADD COLUMN "tenant_id" text REFERENCES "organization"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "journal_entries" ADD COLUMN "tenant_id" text REFERENCES "organization"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "memory_embeddings" ADD COLUMN "tenant_id" text REFERENCES "organization"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "notification_noise_state" ADD COLUMN "tenant_id" text REFERENCES "organization"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "portfolio_positions" ADD COLUMN "tenant_id" text REFERENCES "organization"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "portfolio_settings" ADD COLUMN "tenant_id" text REFERENCES "organization"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "provider_tests" ADD COLUMN "tenant_id" text REFERENCES "organization"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD COLUMN "tenant_id" text REFERENCES "organization"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "rate_limits" ADD COLUMN "tenant_id" text REFERENCES "organization"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "shared_snapshots" ADD COLUMN "tenant_id" text REFERENCES "organization"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "user_sessions" ADD COLUMN "tenant_id" text REFERENCES "organization"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "tenant_id" text REFERENCES "organization"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "user_symbols" ADD COLUMN "tenant_id" text REFERENCES "organization"("id") ON DELETE CASCADE;
--> statement-breakpoint

INSERT INTO "organization" ("id", "name", "created_at", "deleted_at")
SELECT
  u."id",
  COALESCE(
    NULLIF(u."name", ''),
    NULLIF(split_part(u."email", '@', 1), ''),
    'Personal workspace'
  ),
  COALESCE(u."createdAt", now()),
  u."deletedAt"
FROM "user" u
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint

INSERT INTO "organization_member" ("org_id", "user_id", "role")
SELECT u."id", u."id", 'owner'
FROM "user" u
ON CONFLICT ("org_id", "user_id") DO NOTHING;
--> statement-breakpoint

DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'agent_opinions',
    'alerts',
    'audit_logs',
    'bot_links',
    'briefings_emitted',
    'chat_telemetry',
    'chat_threads',
    'chat_tool_telemetry',
    'daily_ai_spend',
    'decision_signal_feedback',
    'decision_signals',
    'journal_entries',
    'memory_embeddings',
    'notification_noise_state',
    'portfolio_positions',
    'portfolio_settings',
    'provider_tests',
    'push_subscriptions',
    'rate_limits',
    'shared_snapshots',
    'user_sessions',
    'user_settings',
    'user_symbols'
  ] LOOP
    EXECUTE format('UPDATE %I SET tenant_id = user_id WHERE tenant_id IS NULL', tbl);
  END LOOP;
END;
$$;
--> statement-breakpoint

UPDATE "chat_messages" cm
SET "tenant_id" = ct."tenant_id"
FROM "chat_threads" ct
WHERE cm."tenant_id" IS NULL
  AND cm."thread_id" = ct."id";
--> statement-breakpoint

UPDATE "decision_signal_outcomes" dso
SET "tenant_id" = ds."tenant_id"
FROM "decision_signals" ds
WHERE dso."tenant_id" IS NULL
  AND dso."signal_id" = ds."id";
--> statement-breakpoint

CREATE OR REPLACE FUNCTION hamafx_set_tenant_id_from_user()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."tenant_id" IS NULL THEN
    NEW."tenant_id" := hamafx_resolve_tenant_id(NEW."user_id");
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION hamafx_set_chat_message_tenant_id()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."tenant_id" IS NULL THEN
    NEW."tenant_id" := COALESCE(
      current_setting('app.current_tenant', true),
      (SELECT ct."tenant_id" FROM "chat_threads" ct WHERE ct."id" = NEW."thread_id")
    );
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION hamafx_set_decision_signal_outcome_tenant_id()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."tenant_id" IS NULL THEN
    NEW."tenant_id" := COALESCE(
      current_setting('app.current_tenant', true),
      (SELECT ds."tenant_id" FROM "decision_signals" ds WHERE ds."id" = NEW."signal_id")
    );
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint

DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'agent_opinions',
    'alerts',
    'audit_logs',
    'bot_links',
    'briefings_emitted',
    'chat_telemetry',
    'chat_threads',
    'chat_tool_telemetry',
    'daily_ai_spend',
    'decision_signal_feedback',
    'decision_signals',
    'journal_entries',
    'memory_embeddings',
    'notification_noise_state',
    'portfolio_positions',
    'portfolio_settings',
    'provider_tests',
    'push_subscriptions',
    'rate_limits',
    'shared_snapshots',
    'user_sessions',
    'user_settings',
    'user_symbols'
  ] LOOP
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE INSERT OR UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION hamafx_set_tenant_id_from_user()',
      'hamafx_' || tbl || '_tenant_id',
      tbl
    );
  END LOOP;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER hamafx_chat_messages_tenant_id
BEFORE INSERT OR UPDATE ON "chat_messages"
FOR EACH ROW
EXECUTE FUNCTION hamafx_set_chat_message_tenant_id();
--> statement-breakpoint

CREATE TRIGGER hamafx_decision_signal_outcomes_tenant_id
BEFORE INSERT OR UPDATE ON "decision_signal_outcomes"
FOR EACH ROW
EXECUTE FUNCTION hamafx_set_decision_signal_outcome_tenant_id();
