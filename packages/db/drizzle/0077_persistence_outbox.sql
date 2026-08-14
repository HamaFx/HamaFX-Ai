-- Phase 5 persistence recovery: durable replay queue for failed AI writes.
-- Payloads are redacted by the application before insertion.

ALTER TABLE "chat_telemetry"
  ADD COLUMN IF NOT EXISTS "idempotency_key" text;
--> statement-breakpoint

ALTER TABLE "chat_tool_telemetry"
  ADD COLUMN IF NOT EXISTS "idempotency_key" text;
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "chat_telemetry_idempotency_uk"
  ON "chat_telemetry" ("idempotency_key");
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "chat_tool_telemetry_idempotency_uk"
  ON "chat_tool_telemetry" ("idempotency_key");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "persistence_outbox" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "tenant_id" text NOT NULL DEFAULT current_setting('app.current_tenant', true) REFERENCES "organization"("id") ON DELETE CASCADE,
  "operation" text NOT NULL,
  "status" text NOT NULL DEFAULT 'pending',
  "dedupe_key" text NOT NULL,
  "thread_id" text,
  "message_id" text,
  "trace_id" text,
  "run_id" text,
  "job_id" text,
  "payload" jsonb NOT NULL,
  "attempt_count" integer NOT NULL DEFAULT 0,
  "max_attempts" integer NOT NULL DEFAULT 8,
  "next_attempt_at" timestamptz NOT NULL DEFAULT now(),
  "locked_until" timestamptz,
  "lock_token" text,
  "last_error" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "completed_at" timestamptz
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "persistence_outbox_dedupe_uk"
  ON "persistence_outbox" ("tenant_id", "dedupe_key");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "persistence_outbox_pending_idx"
  ON "persistence_outbox" ("status", "next_attempt_at");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "persistence_outbox_tenant_idx"
  ON "persistence_outbox" ("tenant_id", "created_at");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "persistence_outbox_trace_idx"
  ON "persistence_outbox" ("trace_id", "created_at");
--> statement-breakpoint

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'hamafx_persistence_outbox_tenant_id'
      AND tgrelid = 'persistence_outbox'::regclass
      AND NOT tgisinternal
  ) THEN
    CREATE TRIGGER hamafx_persistence_outbox_tenant_id
      BEFORE INSERT OR UPDATE ON "persistence_outbox"
      FOR EACH ROW EXECUTE FUNCTION hamafx_set_tenant_id_from_user();
  END IF;
END $$;
