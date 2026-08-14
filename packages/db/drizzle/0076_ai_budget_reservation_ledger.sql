-- Phase 4 budget recovery: durable reservation ledger.
-- The live daily counter remains the admission-control value; this ledger
-- makes interrupted reservations identifiable and terminal writes idempotent.

CREATE TABLE IF NOT EXISTS "ai_budget_reservations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "tenant_id" text NOT NULL DEFAULT current_setting('app.current_tenant', true) REFERENCES "organization"("id") ON DELETE CASCADE,
  "thread_id" uuid,
  "day" date NOT NULL,
  "reserved_usd_cents" double precision NOT NULL,
  "actual_usd_cents" double precision,
  "status" text NOT NULL DEFAULT 'reserved',
  "trace_id" text,
  "run_id" text,
  "job_id" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "resolved_at" timestamptz,
  "last_error" text
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "ai_budget_reservations_user_day_idx"
  ON "ai_budget_reservations" ("user_id", "day");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "ai_budget_reservations_status_idx"
  ON "ai_budget_reservations" ("status", "created_at");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "ai_budget_reservations_trace_idx"
  ON "ai_budget_reservations" ("trace_id", "created_at");
--> statement-breakpoint

-- Match the tenant inference used by the other user-scoped tables. The
-- explicit trigger is required because this table was introduced after the
-- original multi-tenancy trigger migration.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'hamafx_ai_budget_reservations_tenant_id'
      AND tgrelid = 'ai_budget_reservations'::regclass
      AND NOT tgisinternal
  ) THEN
    CREATE TRIGGER hamafx_ai_budget_reservations_tenant_id
      BEFORE INSERT OR UPDATE ON "ai_budget_reservations"
      FOR EACH ROW EXECUTE FUNCTION hamafx_set_tenant_id_from_user();
  END IF;
END $$;
