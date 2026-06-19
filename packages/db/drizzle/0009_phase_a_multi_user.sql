-- Phase A: Multi-user foundation — NextAuth tables + user_id on existing tables.
--
-- This migration adds the schema needed for NextAuth.js v5 and scopes all
-- user-owned data with a `user_id` column referencing the new `user` table.
-- user_id is added as NULLABLE initially; a follow-up data migration script
-- backfills the default user before enforcing NOT NULL.
--
-- Shared data tables (live_ticks, candles_1m, news_articles, news_embeddings,
-- economic_events, snapshots, cot_reports, intermarket_resonance,
-- provider_throttle) are intentionally left unchanged — market data is global.
--
-- The drizzle statement-breakpoint markers below are required: the PGlite
-- migration runner splits on this marker and runs each chunk as a
-- separate SQL statement. Without them, the entire file is sent as a
-- single statement and silently fails (see pglite-client.ts).
--
-- Idempotency: every CREATE TABLE / DROP CONSTRAINT below uses IF NOT
-- EXISTS / IF EXISTS so a partial-failure recovery (e.g. the test
-- process was killed mid-migration) doesn't break the next run.

-- ═══════════════════════════════════════════════════════════════
-- 1. NextAuth.js v5 standard tables
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS "user" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text,
  "email" text NOT NULL,
  "emailVerified" timestamp with time zone,
  "image" text,
  "hashedPassword" text,
  "role" text DEFAULT 'user' NOT NULL,
  "deletedAt" timestamp with time zone,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "user_email_unique" UNIQUE ("email")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "account" (
  "userId" text NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  "type" text NOT NULL,
  "provider" text NOT NULL,
  "providerAccountId" text NOT NULL,
  "refresh_token" text,
  "access_token" text,
  "expires_at" integer,
  "token_type" text,
  "scope" text,
  "id_token" text,
  "session_state" text,
  CONSTRAINT "account_provider_providerAccountId_pk" PRIMARY KEY ("provider", "providerAccountId")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "session" (
  "sessionToken" text PRIMARY KEY NOT NULL,
  "userId" text NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  "expires" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "verificationToken" (
  "identifier" text NOT NULL,
  "token" text NOT NULL,
  "expires" timestamp with time zone NOT NULL,
  CONSTRAINT "verificationToken_identifier_token_pk" PRIMARY KEY ("identifier", "token")
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "verificationToken_token_unique" ON "verificationToken" ("token");
--> statement-breakpoint

-- ═══════════════════════════════════════════════════════════════
-- 2. Application-level user tables
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS "user_settings" (
  "user_id" text PRIMARY KEY NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  "default_symbol" text DEFAULT 'XAUUSD' NOT NULL,
  "timezone" text DEFAULT 'UTC' NOT NULL,
  "language" text DEFAULT 'en' NOT NULL,
  "reduce_motion" boolean DEFAULT false NOT NULL,
  "telegram_bot_token" text,
  "telegram_chat_id" text,
  "alert_email" text,
  "ai_api_keys" text,
  "max_daily_usd" integer,
  "onboarding_completed" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_symbols" (
  "user_id" text NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  "symbol" text NOT NULL,
  "display_order" integer DEFAULT 0 NOT NULL,
  "added_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "user_symbols_user_id_symbol_pk" PRIMARY KEY ("user_id", "symbol")
);
--> statement-breakpoint

-- ═══════════════════════════════════════════════════════════════
-- 3. Add user_id to existing user-scoped tables (NULLABLE initially)
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE "chat_threads" ADD COLUMN IF NOT EXISTS "user_id" text REFERENCES "user" ("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "chat_telemetry" ADD COLUMN IF NOT EXISTS "user_id" text REFERENCES "user" ("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "chat_tool_telemetry" ADD COLUMN IF NOT EXISTS "user_id" text REFERENCES "user" ("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "alerts" ADD COLUMN IF NOT EXISTS "user_id" text REFERENCES "user" ("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "journal_entries" ADD COLUMN IF NOT EXISTS "user_id" text REFERENCES "user" ("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD COLUMN IF NOT EXISTS "user_id" text REFERENCES "user" ("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "shared_snapshots" ADD COLUMN IF NOT EXISTS "user_id" text REFERENCES "user" ("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "memory_embeddings" ADD COLUMN IF NOT EXISTS "user_id" text REFERENCES "user" ("id") ON DELETE CASCADE;
--> statement-breakpoint

-- ═══════════════════════════════════════════════════════════════
-- 4. Rebuild tables whose primary keys changed
-- ═══════════════════════════════════════════════════════════════

-- daily_ai_spend: was (day) PK → now (user_id, day) PK.
-- Postgres auto-named the single-column PK `daily_ai_spend_day_pk`.
-- IF EXISTS so a partial-failure recovery doesn't break the next run.
ALTER TABLE "daily_ai_spend" DROP CONSTRAINT IF EXISTS "daily_ai_spend_day_pk";
--> statement-breakpoint
ALTER TABLE "daily_ai_spend" ADD COLUMN IF NOT EXISTS "user_id" text REFERENCES "user" ("id") ON DELETE CASCADE;
--> statement-breakpoint

-- briefings_emitted: was (event_id, kind) PK → now (user_id, event_id, kind) PK.
-- Constraint name comes from the explicit name in 0002 (see
-- `briefings_emitted_event_id_kind_pk`).
ALTER TABLE "briefings_emitted" DROP CONSTRAINT IF EXISTS "briefings_emitted_event_id_kind_pk";
--> statement-breakpoint
ALTER TABLE "briefings_emitted" ADD COLUMN IF NOT EXISTS "user_id" text REFERENCES "user" ("id") ON DELETE CASCADE;
--> statement-breakpoint

-- memory_embeddings: drop the old unique constraint since it now includes user_id.
ALTER TABLE "memory_embeddings" DROP CONSTRAINT IF EXISTS "memory_embeddings_kind_source_uk";
--> statement-breakpoint

-- ═══════════════════════════════════════════════════════════════
-- 5. user_id indexes for query performance
-- ═══════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS "chat_threads_user_id_idx" ON "chat_threads" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chat_telemetry_user_id_idx" ON "chat_telemetry" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chat_tool_telemetry_user_id_idx" ON "chat_tool_telemetry" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "alerts_user_id_idx" ON "alerts" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "journal_entries_user_id_idx" ON "journal_entries" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "push_subscriptions_user_id_idx" ON "push_subscriptions" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "shared_snapshots_user_id_idx" ON "shared_snapshots" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "memory_embeddings_user_id_idx" ON "memory_embeddings" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "briefings_emitted_user_id_idx" ON "briefings_emitted" ("user_id");
--> statement-breakpoint

-- Composite indexes for common query patterns
CREATE INDEX IF NOT EXISTS "alerts_user_active_idx" ON "alerts" ("user_id", "active");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chat_threads_user_created_idx" ON "chat_threads" ("user_id", "created_at");