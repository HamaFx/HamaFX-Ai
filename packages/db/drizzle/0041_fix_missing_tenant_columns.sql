-- 0041: Fix missing tenant infrastructure (re-apply 0035-0039 through session pooler)
--
-- The Supabase pooler silently dropped DDL from migrations 0035-0040 because
-- PgBouncer in transaction mode doesn't support ALTER TABLE / CREATE TABLE
-- inside transactions. Drizzle Kit's journal recorded them as applied but the
-- actual schema changes never took effect.
--
-- This migration re-applies the entire multi-tenancy foundation idempotently.
-- Every operation checks whether the object/column already exists before acting.

-- ── 1. organization table ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "organization" (
  "id" text PRIMARY KEY,
  "name" text NOT NULL,
  "plan" text NOT NULL DEFAULT 'free',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "deleted_at" timestamptz
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "organization_member" (
  "org_id" text NOT NULL REFERENCES "organization"("id") ON DELETE CASCADE,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "role" text NOT NULL DEFAULT 'member',
  "added_at" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("org_id", "user_id")
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "organization_member_user_idx" ON "organization_member" ("user_id");
--> statement-breakpoint

-- ── 2. Helper functions ────────────────────────────────────────────────────

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

DROP TRIGGER IF EXISTS hamafx_user_personal_organization_after_insert ON "user";
--> statement-breakpoint
CREATE TRIGGER hamafx_user_personal_organization_after_insert
AFTER INSERT ON "user"
FOR EACH ROW
EXECUTE FUNCTION hamafx_provision_personal_organization();
--> statement-breakpoint

-- ── 3. Backfill personal organizations for existing users ─────────────────

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

-- ── 4. Add tenant_id columns (only where missing) ──────────────────────────

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='user_settings' AND column_name='tenant_id') THEN
    ALTER TABLE "user_settings" ADD COLUMN "tenant_id" text REFERENCES "organization"("id") ON DELETE CASCADE;
  END IF;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='chat_threads' AND column_name='tenant_id') THEN
    ALTER TABLE "chat_threads" ADD COLUMN "tenant_id" text REFERENCES "organization"("id") ON DELETE CASCADE;
  END IF;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='chat_messages' AND column_name='tenant_id') THEN
    ALTER TABLE "chat_messages" ADD COLUMN "tenant_id" text REFERENCES "organization"("id") ON DELETE CASCADE;
  END IF;
END $$;
--> statement-breakpoint

-- ── 5. Backfill tenant_id (set to user_id for personal org) ───────────────-

UPDATE "user_settings" SET "tenant_id" = "user_id" WHERE "tenant_id" IS NULL;
--> statement-breakpoint
UPDATE "chat_threads" SET "tenant_id" = "user_id" WHERE "tenant_id" IS NULL;
--> statement-breakpoint
UPDATE "chat_messages" cm
SET "tenant_id" = ct."tenant_id"
FROM "chat_threads" ct
WHERE cm."tenant_id" IS NULL AND cm."thread_id" = ct."id";
--> statement-breakpoint

-- ── 6. Add NOT NULL constraint after backfill (only if column exists) ──────

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='user_settings' AND column_name='tenant_id') THEN
    ALTER TABLE "user_settings" ALTER COLUMN "tenant_id" SET NOT NULL;
  END IF;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='chat_threads' AND column_name='tenant_id') THEN
    ALTER TABLE "chat_threads" ALTER COLUMN "tenant_id" SET NOT NULL;
  END IF;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='chat_messages' AND column_name='tenant_id') THEN
    ALTER TABLE "chat_messages" ALTER COLUMN "tenant_id" SET NOT NULL;
  END IF;
END $$;
--> statement-breakpoint

-- ── 7. Tenant ID auto-set function + triggers ──────────────────────────────

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

-- ── 8. Tenant ID auto-set trigger (only if column exists and trigger doesn't) ─

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='user_settings' AND column_name='tenant_id') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='hamafx_user_settings_tenant_id' AND tgrelid='public.user_settings'::regclass AND NOT tgisinternal) THEN
      CREATE TRIGGER hamafx_user_settings_tenant_id
        BEFORE INSERT OR UPDATE ON "user_settings"
        FOR EACH ROW EXECUTE FUNCTION hamafx_set_tenant_id_from_user();
    END IF;
  END IF;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='chat_threads' AND column_name='tenant_id') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='hamafx_chat_threads_tenant_id' AND tgrelid='public.chat_threads'::regclass AND NOT tgisinternal) THEN
      CREATE TRIGGER hamafx_chat_threads_tenant_id
        BEFORE INSERT OR UPDATE ON "chat_threads"
        FOR EACH ROW EXECUTE FUNCTION hamafx_set_tenant_id_from_user();
    END IF;
  END IF;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='chat_messages' AND column_name='tenant_id') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='hamafx_chat_messages_tenant_id' AND tgrelid='public.chat_messages'::regclass AND NOT tgisinternal) THEN
      CREATE TRIGGER hamafx_chat_messages_tenant_id
        BEFORE INSERT OR UPDATE ON "chat_messages"
        FOR EACH ROW EXECUTE FUNCTION hamafx_set_tenant_id_from_user();
    END IF;
  END IF;
END $$;
--> statement-breakpoint

-- ── 9. Re-create the update_updated_at() function (0039) ────────────────────

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
DECLARE
  col_name text;
BEGIN
  SELECT column_name INTO col_name
  FROM information_schema.columns
  WHERE table_schema = TG_TABLE_SCHEMA
    AND table_name = TG_TABLE_NAME
    AND column_name IN ('updated_at', 'updatedAt')
  LIMIT 1;

  IF col_name = 'updated_at' THEN
    NEW.updated_at = now();
  ELSIF col_name = 'updatedAt' THEN
    NEW."updatedAt" = now();
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint


