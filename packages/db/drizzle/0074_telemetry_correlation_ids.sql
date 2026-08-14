-- Phase 2 observability: persist distributed correlation identifiers directly
-- on AI and tool telemetry rows. Nullable columns preserve legacy rows and
-- avoid coupling retention to diagnostic trace deletion.

ALTER TABLE "chat_telemetry"
  ADD COLUMN IF NOT EXISTS "trace_id" text;
--> statement-breakpoint

ALTER TABLE "chat_telemetry"
  ADD COLUMN IF NOT EXISTS "run_id" text;
--> statement-breakpoint

ALTER TABLE "chat_telemetry"
  ADD COLUMN IF NOT EXISTS "job_id" text;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "chat_telemetry_trace_idx"
  ON "chat_telemetry" ("trace_id", "created_at");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "chat_telemetry_run_idx"
  ON "chat_telemetry" ("run_id", "created_at");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "chat_telemetry_job_idx"
  ON "chat_telemetry" ("job_id", "created_at");
--> statement-breakpoint

ALTER TABLE "chat_tool_telemetry"
  ADD COLUMN IF NOT EXISTS "trace_id" text;
--> statement-breakpoint

ALTER TABLE "chat_tool_telemetry"
  ADD COLUMN IF NOT EXISTS "run_id" text;
--> statement-breakpoint

ALTER TABLE "chat_tool_telemetry"
  ADD COLUMN IF NOT EXISTS "job_id" text;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "chat_tool_telemetry_trace_idx"
  ON "chat_tool_telemetry" ("trace_id", "created_at");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "chat_tool_telemetry_run_idx"
  ON "chat_tool_telemetry" ("run_id", "created_at");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "chat_tool_telemetry_job_idx"
  ON "chat_tool_telemetry" ("job_id", "created_at");
