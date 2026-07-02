-- Phase 3 Session A — tenant_id constraints + index cleanup
--
-- Finalizes the Session A rollout after the additive migration and backfill.

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
    'chat_threads',
    'chat_tool_telemetry',
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
    'user_settings',
    'user_symbols'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ALTER COLUMN tenant_id SET NOT NULL', tbl);
  END LOOP;
END;
$$;
--> statement-breakpoint

ALTER TABLE "chat_messages" ALTER COLUMN "tenant_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "decision_signal_outcomes" ALTER COLUMN "tenant_id" SET NOT NULL;
--> statement-breakpoint

CREATE INDEX "alerts_tenant_id_idx" ON "alerts" ("tenant_id");
--> statement-breakpoint
CREATE INDEX "chat_messages_tenant_id_idx" ON "chat_messages" ("tenant_id");
--> statement-breakpoint
CREATE INDEX "chat_telemetry_tenant_id_idx" ON "chat_telemetry" ("tenant_id");
--> statement-breakpoint
CREATE INDEX "chat_threads_tenant_id_idx" ON "chat_threads" ("tenant_id");
--> statement-breakpoint
CREATE INDEX "chat_tool_telemetry_tenant_id_idx" ON "chat_tool_telemetry" ("tenant_id");
--> statement-breakpoint
CREATE INDEX "decision_signal_feedback_tenant_idx" ON "decision_signal_feedback" ("tenant_id", "created_at");
--> statement-breakpoint
CREATE INDEX "decision_signal_outcomes_tenant_idx" ON "decision_signal_outcomes" ("tenant_id", "evaluated_at");
--> statement-breakpoint
CREATE INDEX "decision_signals_tenant_idx" ON "decision_signals" ("tenant_id", "created_at");
--> statement-breakpoint
CREATE INDEX "journal_entries_tenant_opened_idx" ON "journal_entries" ("tenant_id", "opened_at" DESC);
--> statement-breakpoint
CREATE INDEX "memory_embeddings_tenant_id_idx" ON "memory_embeddings" ("tenant_id");
--> statement-breakpoint

DROP INDEX IF EXISTS "candles_1m_symbol_t_idx";
