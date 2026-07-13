-- 0046: Add DB-level tenant_id defaults to 25 tenant-scoped tables.
-- The Drizzle schema defines current_setting('app.current_tenant', true) as the
-- default for tenant_id on all tenant-scoped tables, but only payments and
-- subscriptions had this at the DB level. The other 25 tables relied solely on
-- BEFORE INSERT triggers to populate tenant_id. This caused drizzle-kit migrate:gen
-- to detect a schema/database mismatch and hang on an interactive prompt.
--
-- Note: user_symbols previously had DEFAULT '__system__'::text in prod. This
-- migration changes it to current_setting(...) to match the Drizzle schema.
-- Raw SQL inserts without the GUC set will now fail NOT NULL instead of
-- silently landing in __system__ — which is the intended behavior.
ALTER TABLE "agent_opinions" ALTER COLUMN "tenant_id" SET DEFAULT current_setting('app.current_tenant', true);
ALTER TABLE "alerts" ALTER COLUMN "tenant_id" SET DEFAULT current_setting('app.current_tenant', true);
ALTER TABLE "audit_logs" ALTER COLUMN "tenant_id" SET DEFAULT current_setting('app.current_tenant', true);
ALTER TABLE "bot_links" ALTER COLUMN "tenant_id" SET DEFAULT current_setting('app.current_tenant', true);
ALTER TABLE "briefings_emitted" ALTER COLUMN "tenant_id" SET DEFAULT current_setting('app.current_tenant', true);
ALTER TABLE "chat_messages" ALTER COLUMN "tenant_id" SET DEFAULT current_setting('app.current_tenant', true);
ALTER TABLE "chat_telemetry" ALTER COLUMN "tenant_id" SET DEFAULT current_setting('app.current_tenant', true);
ALTER TABLE "chat_threads" ALTER COLUMN "tenant_id" SET DEFAULT current_setting('app.current_tenant', true);
ALTER TABLE "chat_tool_telemetry" ALTER COLUMN "tenant_id" SET DEFAULT current_setting('app.current_tenant', true);
ALTER TABLE "daily_ai_spend" ALTER COLUMN "tenant_id" SET DEFAULT current_setting('app.current_tenant', true);
ALTER TABLE "decision_signal_feedback" ALTER COLUMN "tenant_id" SET DEFAULT current_setting('app.current_tenant', true);
ALTER TABLE "decision_signal_outcomes" ALTER COLUMN "tenant_id" SET DEFAULT current_setting('app.current_tenant', true);
ALTER TABLE "decision_signals" ALTER COLUMN "tenant_id" SET DEFAULT current_setting('app.current_tenant', true);
ALTER TABLE "journal_entries" ALTER COLUMN "tenant_id" SET DEFAULT current_setting('app.current_tenant', true);
ALTER TABLE "memory_embeddings" ALTER COLUMN "tenant_id" SET DEFAULT current_setting('app.current_tenant', true);
ALTER TABLE "notification_noise_state" ALTER COLUMN "tenant_id" SET DEFAULT current_setting('app.current_tenant', true);
ALTER TABLE "portfolio_positions" ALTER COLUMN "tenant_id" SET DEFAULT current_setting('app.current_tenant', true);
ALTER TABLE "portfolio_settings" ALTER COLUMN "tenant_id" SET DEFAULT current_setting('app.current_tenant', true);
ALTER TABLE "provider_tests" ALTER COLUMN "tenant_id" SET DEFAULT current_setting('app.current_tenant', true);
ALTER TABLE "push_subscriptions" ALTER COLUMN "tenant_id" SET DEFAULT current_setting('app.current_tenant', true);
ALTER TABLE "rate_limits" ALTER COLUMN "tenant_id" SET DEFAULT current_setting('app.current_tenant', true);
ALTER TABLE "shared_snapshots" ALTER COLUMN "tenant_id" SET DEFAULT current_setting('app.current_tenant', true);
ALTER TABLE "user_sessions" ALTER COLUMN "tenant_id" SET DEFAULT current_setting('app.current_tenant', true);
ALTER TABLE "user_settings" ALTER COLUMN "tenant_id" SET DEFAULT current_setting('app.current_tenant', true);
ALTER TABLE "user_symbols" ALTER COLUMN "tenant_id" SET DEFAULT current_setting('app.current_tenant', true);
