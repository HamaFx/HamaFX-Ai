-- Durable user feedback and governed reviewer annotations.
-- Raw prompts and assistant outputs are deliberately not copied here.

CREATE TABLE IF NOT EXISTS "ai_message_feedback" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "tenant_id" text NOT NULL DEFAULT current_setting('app.current_tenant', true) REFERENCES "organization"("id") ON DELETE CASCADE,
  "thread_id" uuid NOT NULL REFERENCES "chat_threads"("id") ON DELETE CASCADE,
  "message_id" uuid NOT NULL REFERENCES "chat_messages"("id") ON DELETE CASCADE,
  "trace_id" text,
  "rating" text NOT NULL,
  "user_note" text,
  "review_status" text NOT NULL DEFAULT 'unreviewed',
  "reviewer_id" text REFERENCES "user"("id") ON DELETE SET NULL,
  "reviewer_label" text,
  "issue_codes" jsonb,
  "reviewer_note" text,
  "reviewed_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "ai_message_feedback_user_message_uk"
  ON "ai_message_feedback" ("user_id", "message_id");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "ai_message_feedback_review_status_idx"
  ON "ai_message_feedback" ("review_status", "updated_at");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "ai_message_feedback_thread_idx"
  ON "ai_message_feedback" ("thread_id", "created_at");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "ai_message_feedback_trace_idx"
  ON "ai_message_feedback" ("trace_id", "created_at");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "ai_message_feedback_reviewer_idx"
  ON "ai_message_feedback" ("reviewer_id", "reviewed_at");
--> statement-breakpoint

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'hamafx_ai_message_feedback_tenant_id'
      AND tgrelid = 'ai_message_feedback'::regclass
      AND NOT tgisinternal
  ) THEN
    CREATE TRIGGER hamafx_ai_message_feedback_tenant_id
      BEFORE INSERT OR UPDATE ON "ai_message_feedback"
      FOR EACH ROW EXECUTE FUNCTION hamafx_set_tenant_id_from_user();
  END IF;
END $$;
