-- 0039: Fix Phase 3 runtime verification bugs
--
-- Bug 1: account and session tables have FORCE RLS enabled with zero policies
--   (migration 0038 tried to CREATE POLICY tenant_isolation on them but they
--   have no tenant_id column, so the policy creation failed silently). With
--   FORCE RLS and no policies, ALL access to these tables is blocked.
--   Fix: disable RLS on account and session. These are NextAuth adapter tables
--   scoped by userId FK (ON DELETE CASCADE) — they don't carry tenant_id and
--   don't need tenant-level isolation.
--
-- Bug 2: update_updated_at() trigger function hardcodes NEW.updated_at (snake_case)
--   but the "user" table uses "updatedAt" (camelCase, Drizzle convention).
--   Fix: replace the trigger function with one that detects the column name
--   dynamically at trigger-fire time.

-- ── Bug 1: Remove RLS from account and session ──────────────────────────

DROP POLICY IF EXISTS tenant_isolation ON account;
--> statement-breakpoint
ALTER TABLE account NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE account DISABLE ROW LEVEL SECURITY;
--> statement-breakpoint

DROP POLICY IF EXISTS tenant_isolation ON session;
--> statement-breakpoint
ALTER TABLE session NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE session DISABLE ROW LEVEL SECURITY;
--> statement-breakpoint

-- ── Bug 2: Fix update_updated_at() for camelCase columns ───────────────

-- Drop the existing trigger function and all triggers that use it
DROP TRIGGER IF EXISTS trg_updated_at_user ON "user";
--> statement-breakpoint
DROP TRIGGER IF EXISTS trg_updated_at_user_settings ON "user_settings";
--> statement-breakpoint
DROP TRIGGER IF EXISTS trg_updated_at_chat_threads ON "chat_threads";
--> statement-breakpoint
DROP TRIGGER IF EXISTS trg_updated_at_journal_entries ON "journal_entries";
--> statement-breakpoint
DROP TRIGGER IF EXISTS trg_updated_at_portfolio_positions ON "portfolio_positions";
--> statement-breakpoint
DROP TRIGGER IF EXISTS trg_updated_at_portfolio_settings ON "portfolio_settings";
--> statement-breakpoint
DROP TRIGGER IF EXISTS trg_updated_at_decision_signals ON "decision_signals";
--> statement-breakpoint

-- Replace with a column-name-agnostic version that works for both
-- snake_case (updated_at) and camelCase (updatedAt) columns.
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  IF has_column_property THEN
    NEW.updated_at = now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

-- Actually, use a simpler approach: check TG_TABLE_NAME and set the right column.
-- PostgreSQL doesn't allow dynamic column access in plpgsql easily, so we use
-- a per-table trigger function approach instead.

DROP FUNCTION update_updated_at();
--> statement-breakpoint

-- Generic function that tries updated_at first, falls back to updatedAt
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

-- Recreate all triggers
CREATE TRIGGER trg_updated_at_user
  BEFORE UPDATE ON "user"
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
--> statement-breakpoint

CREATE TRIGGER trg_updated_at_user_settings
  BEFORE UPDATE ON "user_settings"
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
--> statement-breakpoint

CREATE TRIGGER trg_updated_at_chat_threads
  BEFORE UPDATE ON "chat_threads"
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
--> statement-breakpoint

CREATE TRIGGER trg_updated_at_journal_entries
  BEFORE UPDATE ON "journal_entries"
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
--> statement-breakpoint

CREATE TRIGGER trg_updated_at_portfolio_positions
  BEFORE UPDATE ON "portfolio_positions"
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
--> statement-breakpoint

CREATE TRIGGER trg_updated_at_portfolio_settings
  BEFORE UPDATE ON "portfolio_settings"
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
--> statement-breakpoint

CREATE TRIGGER trg_updated_at_decision_signals
  BEFORE UPDATE ON "decision_signals"
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
--> statement-breakpoint


