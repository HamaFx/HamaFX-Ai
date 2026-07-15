-- Migration 0050 — Fix tenant-id triggers for chat_messages and briefings_emitted
--
-- Problem: The `hamafx_chat_messages_tenant_id` trigger was calling
-- `hamafx_set_tenant_id_from_user()` which resolves tenant from NEW."user_id" —
-- but `chat_messages` doesn't have a `user_id` column. The correct function is
-- `hamafx_set_chat_message_tenant_id()` which resolves through `chat_threads`.
--
-- Also adds `hamafx_briefings_tenant_id` trigger on `briefings_emitted` so
-- tenant_id is always populated even when `app.current_tenant` isn't set
-- (e.g. in the worker daemon).
--
-- All statements are idempotent (safe to re-run).

-- 1. Revert the generic tenant trigger to use user_id (original behaviour).
--    Do NOT reference NEW.thread_id here — this function is used by tables
--    that have user_id but NOT thread_id (journal_entries, alerts, etc.).
CREATE OR REPLACE FUNCTION hamafx_set_tenant_id_from_user()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."tenant_id" IS NULL THEN
    NEW."tenant_id" := hamafx_resolve_tenant_id(NEW."user_id");
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint

-- 2. Fix the chat_messages trigger — use the correct function that resolves
--    tenant through chat_threads (chat_messages has thread_id, not user_id).
DROP TRIGGER IF EXISTS hamafx_chat_messages_tenant_id ON "chat_messages";
--> statement-breakpoint

CREATE TRIGGER hamafx_chat_messages_tenant_id
  BEFORE INSERT OR UPDATE ON "chat_messages"
  FOR EACH ROW
  EXECUTE FUNCTION hamafx_set_chat_message_tenant_id();
--> statement-breakpoint

-- 3. Create trigger for briefings_emitted — resolves tenant from user_id
--    when the session setting app.current_tenant is not available.
CREATE OR REPLACE FUNCTION hamafx_set_briefings_tenant_id()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."tenant_id" IS NULL THEN
    NEW."tenant_id" := hamafx_resolve_tenant_id(NEW."user_id");
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint

DROP TRIGGER IF EXISTS hamafx_briefings_tenant_id ON "briefings_emitted";
--> statement-breakpoint

CREATE TRIGGER hamafx_briefings_tenant_id
  BEFORE INSERT OR UPDATE ON "briefings_emitted"
  FOR EACH ROW
  EXECUTE FUNCTION hamafx_set_briefings_tenant_id();
