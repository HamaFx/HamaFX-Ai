ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "failed_login_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "locked_until" timestamp with time zone;--> statement-breakpoint
-- Analysis_mode was missing in prod DB — safe IF NOT EXISTS for tables that should have it
ALTER TABLE "chat_threads" ADD COLUMN IF NOT EXISTS "analysis_mode" text DEFAULT 'single';--> statement-breakpoint
ALTER TABLE "agent_opinions" ADD COLUMN IF NOT EXISTS "analysis_mode" text NOT NULL DEFAULT '';--> statement-breakpoint
ALTER TABLE "decision_signals" ADD COLUMN IF NOT EXISTS "analysis_mode" text;