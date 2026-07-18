-- Migration 0058: Drop dangling linked_signal_id column (DB Audit M9)
--
-- linked_signal_id referenced the dropped decision_signals table
-- (removed in migration 0052). The FK constraint was already dropped
-- by 0052's CASCADE; this migration removes the orphan column.
--
-- Idempotent — safe to re-run.

ALTER TABLE "portfolio_positions" DROP COLUMN IF EXISTS "linked_signal_id";
