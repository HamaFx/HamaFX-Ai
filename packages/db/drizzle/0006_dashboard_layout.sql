-- Phase 1 hardening — see docs/15-hardening-phase-1-correctness.md.
--
-- §7  Atomic daily AI-spend counter — replaces the racy SUM-then-compare
--     pattern in `enforceDailyBudget()` with a row-level UPDATE that
--     serialises concurrent reservations against the cap.
--
-- §8  Memory upsert atomicity — adds the unique constraint that lets
--     `INSERT … ON CONFLICT DO UPDATE` replace the previous
--     `DELETE + INSERT` pair in `memory-index.ts`. The earlier sequence
--     left rows missing forever on a crash between the two statements.

CREATE TABLE "daily_ai_spend" (
	"day" date PRIMARY KEY NOT NULL,
	"total_usd_cents" bigint NOT NULL DEFAULT 0
);
--> statement-breakpoint

ALTER TABLE "memory_embeddings"
  ADD CONSTRAINT "memory_embeddings_kind_source_uk" UNIQUE ("kind", "source_id");
