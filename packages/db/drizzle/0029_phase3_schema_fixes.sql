-- Phase 3: Schema Fixes
--
-- Task 14: memory_embeddings unique constraint → include user_id
--   Old: unique(kind, source_id) — cross-user collision risk
--   New: unique(user_id, kind, source_id) — scoped per user
--
-- Task 15: snapshots unique constraint on (symbol, kind, as_of)
--   Prevents duplicate snapshots from overlapping cron runs
--
-- Task 16: Rename agent_opinions indexes to standard naming convention
--   idx_agent_opinions_thread → agent_opinions_thread_idx
--   idx_agent_opinions_user_created → agent_opinions_user_created_idx
--
-- Task 17: Drop redundant chat_telemetry_user_id_idx
--   Covered by composite telemetry_user_created_idx (user_id, created_at)
--
-- Task 18: Add evaluated_at index to decision_signal_outcomes

-- Task 14: memory_embeddings — replace unique constraint
ALTER TABLE "memory_embeddings" DROP CONSTRAINT IF EXISTS "memory_embeddings_kind_source_uk";
--> statement-breakpoint
ALTER TABLE "memory_embeddings"
  ADD CONSTRAINT "memory_embeddings_user_kind_source_uk"
  UNIQUE ("user_id", "kind", "source_id");
--> statement-breakpoint

-- Task 15: snapshots — add unique constraint on (symbol, kind, as_of)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'snapshots_symbol_kind_asof_uk'
  ) THEN
    ALTER TABLE "snapshots"
      ADD CONSTRAINT "snapshots_symbol_kind_asof_uk"
      UNIQUE ("symbol", "kind", "as_of");
  END IF;
END $$;
--> statement-breakpoint

-- Task 16: Rename agent_opinions indexes to standard naming convention
DROP INDEX IF EXISTS "idx_agent_opinions_thread";
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_opinions_thread_idx" ON "agent_opinions" ("thread_id");
--> statement-breakpoint
DROP INDEX IF EXISTS "idx_agent_opinions_user_created";
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_opinions_user_created_idx" ON "agent_opinions" ("user_id", "created_at");
--> statement-breakpoint

-- Task 17: Drop redundant chat_telemetry_user_id_idx (covered by composite)
DROP INDEX IF EXISTS "chat_telemetry_user_id_idx";
--> statement-breakpoint

-- Task 18: Add evaluated_at index to decision_signal_outcomes
CREATE INDEX IF NOT EXISTS "decision_signal_outcomes_evaluated_idx"
  ON "decision_signal_outcomes" ("evaluated_at");