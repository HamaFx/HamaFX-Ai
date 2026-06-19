-- Phase A.4 — enforce user_id NOT NULL on user-scoped tables.
--
-- Migration 0009 added user_id as NULLABLE so existing data wouldn't
-- break the deploy. This migration closes that loophole:
--
--   1. Backfills any rows with NULL user_id to the default admin user
--      (creating the default admin if the users table is empty —
--      mirrors what apps/web/src/instrumentation.ts does at boot).
--   2. Sets each user_id column to NOT NULL.
--
-- Idempotent: safe to re-run. The backfill uses a `WHERE user_id IS NULL`
-- guard so existing values are never overwritten. The column alterations
-- use IF EXISTS guards so re-runs don't fail.
--
-- Default admin credentials (from apps/web/src/instrumentation.ts):
--   email: process.env.ADMIN_EMAIL || 'admin@localhost'
--   name:  'Admin'
-- We hard-code the fallback here because migrations can't read env.

-- Step 1: ensure the default admin user exists, and capture its ID.
DO $$
DECLARE
  admin_id text;
BEGIN
  -- Pick any existing user (should always be one after the legacy
  -- bootstrap in apps/web/src/instrumentation.ts, but fall back to
  -- creating the default admin so the migration is self-sufficient).
  SELECT id INTO admin_id FROM "user" ORDER BY "createdAt" ASC LIMIT 1;

  IF admin_id IS NULL THEN
    admin_id := gen_random_uuid()::text;
    INSERT INTO "user" ("id", "email", "name", "role")
    VALUES (admin_id, 'admin@localhost', 'Admin', 'user')
    ON CONFLICT ("email") DO NOTHING;
    -- Re-read in case the INSERT was a conflict (the existing row wins).
    SELECT id INTO admin_id FROM "user" WHERE "email" = 'admin@localhost' LIMIT 1;
  END IF;

  -- Backfill every NULL user_id row across all user-scoped tables.
  UPDATE "chat_threads"        SET "user_id" = admin_id WHERE "user_id" IS NULL;
  UPDATE "chat_telemetry"      SET "user_id" = admin_id WHERE "user_id" IS NULL;
  UPDATE "chat_tool_telemetry" SET "user_id" = admin_id WHERE "user_id" IS NULL;
  UPDATE "alerts"              SET "user_id" = admin_id WHERE "user_id" IS NULL;
  UPDATE "journal_entries"     SET "user_id" = admin_id WHERE "user_id" IS NULL;
  UPDATE "memory_embeddings"   SET "user_id" = admin_id WHERE "user_id" IS NULL;
  UPDATE "push_subscriptions"  SET "user_id" = admin_id WHERE "user_id" IS NULL;
  UPDATE "shared_snapshots"    SET "user_id" = admin_id WHERE "user_id" IS NULL;
END $$;
--> statement-breakpoint

-- Step 2: enforce NOT NULL on each user_id column.
DO $$
BEGIN
  -- chat_threads
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'chat_threads'
               AND column_name = 'user_id' AND is_nullable = 'YES') THEN
    ALTER TABLE "chat_threads" ALTER COLUMN "user_id" SET NOT NULL;
  END IF;
  -- chat_telemetry
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'chat_telemetry'
               AND column_name = 'user_id' AND is_nullable = 'YES') THEN
    ALTER TABLE "chat_telemetry" ALTER COLUMN "user_id" SET NOT NULL;
  END IF;
  -- chat_tool_telemetry
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'chat_tool_telemetry'
               AND column_name = 'user_id' AND is_nullable = 'YES') THEN
    ALTER TABLE "chat_tool_telemetry" ALTER COLUMN "user_id" SET NOT NULL;
  END IF;
  -- alerts
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'alerts'
               AND column_name = 'user_id' AND is_nullable = 'YES') THEN
    ALTER TABLE "alerts" ALTER COLUMN "user_id" SET NOT NULL;
  END IF;
  -- journal_entries
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'journal_entries'
               AND column_name = 'user_id' AND is_nullable = 'YES') THEN
    ALTER TABLE "journal_entries" ALTER COLUMN "user_id" SET NOT NULL;
  END IF;
  -- memory_embeddings
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'memory_embeddings'
               AND column_name = 'user_id' AND is_nullable = 'YES') THEN
    ALTER TABLE "memory_embeddings" ALTER COLUMN "user_id" SET NOT NULL;
  END IF;
  -- push_subscriptions
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'push_subscriptions'
               AND column_name = 'user_id' AND is_nullable = 'YES') THEN
    ALTER TABLE "push_subscriptions" ALTER COLUMN "user_id" SET NOT NULL;
  END IF;
  -- shared_snapshots
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'shared_snapshots'
               AND column_name = 'user_id' AND is_nullable = 'YES') THEN
    ALTER TABLE "shared_snapshots" ALTER COLUMN "user_id" SET NOT NULL;
  END IF;
END $$;