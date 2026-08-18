-- Privacy-safe regression cases generated from reviewer-labelled AI failures.
-- Conversation text is referenced by IDs and represented by hashes only.

CREATE TABLE IF NOT EXISTS "ai_regression_cases" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "feedback_id" uuid NOT NULL REFERENCES "ai_message_feedback"("id") ON DELETE CASCADE,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "tenant_id" text NOT NULL DEFAULT current_setting('app.current_tenant', true) REFERENCES "organization"("id") ON DELETE CASCADE,
  "thread_id" uuid NOT NULL REFERENCES "chat_threads"("id") ON DELETE CASCADE,
  "message_id" uuid NOT NULL REFERENCES "chat_messages"("id") ON DELETE CASCADE,
  "prompt_sha256" text NOT NULL,
  "assistant_output_sha256" text NOT NULL,
  "issue_codes" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "reviewer_note" text,
  "status" text NOT NULL DEFAULT 'open',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "ai_regression_cases_feedback_uk"
  ON "ai_regression_cases" ("feedback_id");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "ai_regression_cases_status_idx"
  ON "ai_regression_cases" ("status", "updated_at");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "ai_regression_cases_user_idx"
  ON "ai_regression_cases" ("user_id", "created_at");
