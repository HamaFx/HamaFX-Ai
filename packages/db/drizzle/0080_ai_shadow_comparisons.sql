-- Privacy-safe Mastra versus legacy comparison aggregates.
-- Raw prompts and model output are intentionally not stored.

CREATE TABLE IF NOT EXISTS "ai_shadow_comparisons" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "tenant_id" text NOT NULL DEFAULT current_setting('app.current_tenant', true) REFERENCES "organization"("id") ON DELETE CASCADE,
  "thread_id" uuid NOT NULL REFERENCES "chat_threads"("id") ON DELETE CASCADE,
  "prompt_sha256" text NOT NULL,
  "primary_agent" text NOT NULL,
  "outcome" text NOT NULL,
  "failure_reason" text,
  "legacy_chars" integer,
  "mastra_chars" integer,
  "shared_token_ratio" double precision,
  "overlap" text,
  "mastra_verified" boolean,
  "mastra_bias" text,
  "mastra_data_quality" text,
  "primary_latency_ms" integer,
  "shadow_latency_ms" integer,
  "primary_cost_usd" double precision,
  "shadow_cost_usd" double precision,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "ai_shadow_comparisons_created_idx"
  ON "ai_shadow_comparisons" ("created_at");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "ai_shadow_comparisons_thread_idx"
  ON "ai_shadow_comparisons" ("thread_id", "created_at");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "ai_shadow_comparisons_outcome_idx"
  ON "ai_shadow_comparisons" ("outcome", "created_at");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "ai_shadow_comparisons_primary_idx"
  ON "ai_shadow_comparisons" ("primary_agent", "created_at");
