-- 0042: Migration files for feature_flags and diagnostic_traces
-- These tables were created manually in prod and never had migration files.
-- Idempotent: uses IF NOT EXISTS so safe to run against prod where tables exist.

CREATE TABLE IF NOT EXISTS "feature_flags" (
  "key" text PRIMARY KEY NOT NULL,
  "enabled" boolean NOT NULL DEFAULT false,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_by" text
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "diagnostic_traces" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text,
  "thread_id" text,
  "started_at" timestamp with time zone NOT NULL,
  "duration_ms" integer,
  "step_count" integer NOT NULL DEFAULT 0,
  "error_count" integer NOT NULL DEFAULT 0,
  "status" text NOT NULL,
  "summary" text,
  "metadata" jsonb,
  "trace" jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'diagnostic_traces_user_id_fkey') THEN
    ALTER TABLE "diagnostic_traces" ADD CONSTRAINT "diagnostic_traces_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE CASCADE;
  END IF;
END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "diagnostic_traces_user_id_idx" ON "diagnostic_traces" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "diagnostic_traces_thread_id_idx" ON "diagnostic_traces" ("thread_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "diagnostic_traces_started_at_idx" ON "diagnostic_traces" ("started_at");
