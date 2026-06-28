-- Migration 0032: Phase 8 — Soft-delete columns, Postgres enums, FTS index
--
-- Task 41: Add deleted_at to journal_entries, portfolio_positions, decision_signals
-- Task 43: Add Postgres enum types for fixed-value fields
-- Task 44: Add full-text search index on news_articles

-- ── Task 41: Soft-delete columns ──────────────────────────────────────

ALTER TABLE "journal_entries" ADD COLUMN IF NOT EXISTS "deleted_at" timestamptz;
ALTER TABLE "portfolio_positions" ADD COLUMN IF NOT EXISTS "deleted_at" timestamptz;
ALTER TABLE "decision_signals" ADD COLUMN IF NOT EXISTS "deleted_at" timestamptz;

-- Indexes for soft-delete queries (WHERE deleted_at IS NULL)
CREATE INDEX IF NOT EXISTS "journal_entries_deleted_at_idx" ON "journal_entries" ("deleted_at");
CREATE INDEX IF NOT EXISTS "portfolio_positions_deleted_at_idx" ON "portfolio_positions" ("deleted_at");
CREATE INDEX IF NOT EXISTS "decision_signals_deleted_at_idx" ON "decision_signals" ("deleted_at");

-- ── Task 43: Postgres enum types ──────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('user', 'admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE journal_outcome AS ENUM ('open', 'win', 'loss', 'breakeven');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE portfolio_status AS ENUM ('open', 'closed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE signal_action AS ENUM ('buy', 'sell', 'hold', 'reduce', 'add', 'avoid');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE signal_bias AS ENUM ('bullish', 'bearish', 'neutral');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE signal_status AS ENUM ('active', 'expired', 'invalidated', 'closed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE signal_source AS ENUM ('chat', 'alert', 'briefing', 'manual');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE signal_horizon AS ENUM ('intraday', '1d', '3d', '5d', '10d', 'swing');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE signal_outcome AS ENUM ('hit', 'miss', 'neutral');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE signal_eval_status AS ENUM ('completed', 'unable');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE signal_feedback AS ENUM ('useful', 'not_useful');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE briefing_kind AS ENUM ('pre', 'post', 'weekly_review');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE bot_platform AS ENUM ('telegram', 'discord', 'slack');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Note: Column type conversions from text to enum are intentionally
-- NOT done in this migration. Postgres can implicitly cast text to enum
-- values, so existing text columns work with the enum types. Converting
-- the column types requires careful handling of any existing invalid
-- values and should be done in a separate migration after data validation.

-- ── Task 44: Full-text search index on news_articles ──────────────────

CREATE INDEX IF NOT EXISTS "news_fts_idx"
  ON "news_articles"
  USING gin (to_tsvector('english', coalesce(title, '') || ' ' || coalesce(summary, '')));