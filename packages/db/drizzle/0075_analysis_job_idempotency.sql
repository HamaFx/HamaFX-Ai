-- Phase 3 worker reliability: deduplicate repeated Full-mode queue submissions.
-- Nullable keys preserve legacy jobs while allowing safe retries for new jobs.

ALTER TABLE "analysis_jobs"
  ADD COLUMN IF NOT EXISTS "idempotency_key" text;
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "analysis_jobs_user_idempotency_uk"
  ON "analysis_jobs" ("user_id", "idempotency_key");
