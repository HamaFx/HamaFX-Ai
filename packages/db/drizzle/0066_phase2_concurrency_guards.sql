-- Phase 2 — concurrency guards.
--
-- The briefing index makes the per-user singleton a database invariant.
-- The alert lease prevents concurrent cron runners from delivering the same
-- external notification at the same time; stale leases are reclaimable.

-- Do not silently delete historical briefing conversations. An operator must
-- choose the canonical row and reconcile dependent messages before this
-- invariant can be installed on a database that already has duplicates.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "chat_threads"
    WHERE "is_briefings" = true
    GROUP BY "user_id"
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate briefing threads exist; reconcile chat_threads.is_briefings rows before applying 0066';
  END IF;
END $$;
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "chat_threads_one_briefings_per_user_idx"
  ON "chat_threads" ("user_id")
  WHERE "is_briefings" = true;
--> statement-breakpoint

ALTER TABLE "alerts"
  ADD COLUMN IF NOT EXISTS "delivery_claimed_at" timestamptz;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "alerts_delivery_claimed_at_idx"
  ON "alerts" ("delivery_claimed_at");
