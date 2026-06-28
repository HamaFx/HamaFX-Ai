-- Multi-Agent Orchestration System
-- Adds agent_opinions table + analysis_mode columns to chat_threads and user_settings

CREATE TABLE IF NOT EXISTS "agent_opinions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "thread_id" uuid NOT NULL REFERENCES "chat_threads"("id") ON DELETE CASCADE,
  "message_id" uuid NOT NULL REFERENCES "chat_messages"("id") ON DELETE CASCADE,
  "agent_name" text NOT NULL,
  "bias" text NOT NULL,
  "confidence" real NOT NULL,
  "reasoning" text NOT NULL,
  "raw_data" jsonb NOT NULL,
  "model" text NOT NULL,
  "cost_usd" real NOT NULL,
  "latency_ms" integer NOT NULL,
  "analysis_mode" text NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_agent_opinions_thread" ON "agent_opinions" ("thread_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_agent_opinions_user_created" ON "agent_opinions" ("user_id", "created_at" DESC);
--> statement-breakpoint
ALTER TABLE "chat_threads" ADD COLUMN IF NOT EXISTS "analysis_mode" text DEFAULT 'single';
--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN IF NOT EXISTS "default_analysis_mode" text DEFAULT 'auto';
--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN IF NOT EXISTS "show_agent_opinions" boolean NOT NULL DEFAULT true;
--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN IF NOT EXISTS "agent_model_overrides" jsonb;