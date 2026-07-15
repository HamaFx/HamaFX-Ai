-- Migration 0050 — Fix tenant-id triggers
--
-- Fixes three classes of tenant-trigger problems discovered in production:
--
--   1. chat_messages: its trigger was calling hamafx_set_tenant_id_from_user()
--      which resolves from NEW."user_id", a column chat_messages doesn't have.
--      Fixed by switching to hamafx_set_chat_message_tenant_id() which resolves
--      through the chat_threads relationship.
--
--   2. 12 tables that have user_id columns were missing their tenant triggers
--      entirely, causing NOT-NULL violations when app.current_tenant is not set
--      (e.g. in the worker daemon or chat tool handlers).
--      Tables: agent_opinions, alerts, bot_links, chat_telemetry,
--      decision_signals, journal_entries, memory_embeddings, portfolio_positions,
--      provider_tests, shared_snapshots, user_sessions, user_symbols.
--
--   3. briefings_emitted: same missing-trigger pattern as group 2.
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

-- 3. Create missing tenant triggers for all 22 user-scoped tables.
--    Each trigger calls hamafx_set_tenant_id_from_user() which resolves tenant
--    from NEW.user_id when the session setting app.current_tenant is unavailable.
DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'agent_opinions',
    'alerts',
    'audit_logs',
    'bot_links',
    'briefings_emitted',
    'chat_telemetry',
    'chat_tool_telemetry',
    'cron_runs',
    'daily_ai_spend',
    'decision_signal_feedback',
    'decision_signals',
    'journal_entries',
    'memory_embeddings',
    'notification_noise_state',
    'portfolio_positions',
    'portfolio_settings',
    'provider_tests',
    'push_subscriptions',
    'rate_limits',
    'shared_snapshots',
    'user_sessions',
    'user_symbols'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', 'hamafx_' || tbl || '_tenant_id', tbl);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE INSERT OR UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION hamafx_set_tenant_id_from_user()',
      'hamafx_' || tbl || '_tenant_id',
      tbl
    );
  END LOOP;
END;
$$;
