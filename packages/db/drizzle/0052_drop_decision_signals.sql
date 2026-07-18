-- Migration 0052: Drop decision_signals feature tables (Plan A — feature removed)
-- Drops the three decision-signal tables and their associated Postgres enum types.
-- Idempotent — uses IF EXISTS throughout.

-- Drop foreign key from portfolio_positions that references decision_signals
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'portfolio_positions_linked_signal_id_decision_signals_id_fk'
  ) THEN
    ALTER TABLE "portfolio_positions" DROP CONSTRAINT "portfolio_positions_linked_signal_id_decision_signals_id_fk";
  END IF;
END$$;

-- Drop the tables (CASCADE handles dependent FKs, triggers, indexes, policies)
DROP TABLE IF EXISTS "decision_signal_feedback" CASCADE;
DROP TABLE IF EXISTS "decision_signal_outcomes" CASCADE;
DROP TABLE IF EXISTS "decision_signals" CASCADE;

-- Drop the related Postgres enum types created in migration 0032
DROP TYPE IF EXISTS "signal_action" CASCADE;
DROP TYPE IF EXISTS "signal_bias" CASCADE;
DROP TYPE IF EXISTS "signal_status" CASCADE;
DROP TYPE IF EXISTS "signal_source" CASCADE;
DROP TYPE IF EXISTS "signal_horizon" CASCADE;
DROP TYPE IF EXISTS "signal_outcome" CASCADE;
DROP TYPE IF EXISTS "signal_eval_status" CASCADE;
DROP TYPE IF EXISTS "signal_feedback" CASCADE;
