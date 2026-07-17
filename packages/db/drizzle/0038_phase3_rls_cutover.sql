-- Phase 3 §3.6 — RLS cutover migration.
--
-- This is the one migration in the whole plan that's genuinely hard to walk
-- back. It enables Row-Level Security + FORCE RLS and creates the
-- tenant_isolation policy on every tenant-owned table.
--
-- GATING: This migration is gated behind the HAMAFX_ENABLE_RLS env var.
-- The migration SQL itself is unconditional (Drizzle applies it), but the
-- application only sets app.current_tenant when RLS is enabled. In self-host
-- mode (AUTH_MODE=legacy), the worker connects as the BYPASSRLS admin role
-- (or the regular role if ADMIN_DATABASE_URL is not set), so policies are
-- bypassed even if they exist.
--
-- The self-host edition has two options:
--   1. Skip this migration entirely (don't run migrate:apply)
--   2. Run it but connect via the hamafx_admin BYPASSRLS role
--
-- Both are safe. The hosted SaaS edition MUST run this migration.
--
-- REVERSAL: To undo, run:
--   DROP POLICY tenant_isolation ON <table>; ALTER TABLE <table> DISABLE ROW LEVEL SECURITY;
-- for each table listed below.
--
-- POLICY: tenant_isolation
--   USING (tenant_id = current_setting('app.current_tenant', true))
--   WITH CHECK (tenant_id = current_setting('app.current_tenant', true))
--
-- This means:
--   - SELECT/UPDATE/DELETE only see rows where tenant_id matches the GUC
--   - INSERT/UPDATE requires the new row's tenant_id to match the GUC
--   - When app.current_tenant is unset, current_setting(..., true) returns NULL,
--     so no rows match → zero tenant rows returned (not all rows)
--   - The hamafx_admin role (BYPASSRLS) is exempt — worker/cron/migrations
--     can still see all tenants

-- ── Direct tenant tables (have both user_id and tenant_id) ──────────────

ALTER TABLE agent_opinions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE agent_opinions FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON agent_opinions
  FOR ALL
  USING (tenant_id = current_setting('app.current_tenant', true))
  WITH CHECK (tenant_id = current_setting('app.current_tenant', true));
--> statement-breakpoint

ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE alerts FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON alerts
  FOR ALL
  USING (tenant_id = current_setting('app.current_tenant', true))
  WITH CHECK (tenant_id = current_setting('app.current_tenant', true));
--> statement-breakpoint

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON audit_logs
  FOR ALL
  USING (tenant_id = current_setting('app.current_tenant', true))
  WITH CHECK (tenant_id = current_setting('app.current_tenant', true));
--> statement-breakpoint

ALTER TABLE bot_links ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE bot_links FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON bot_links
  FOR ALL
  USING (tenant_id = current_setting('app.current_tenant', true))
  WITH CHECK (tenant_id = current_setting('app.current_tenant', true));
--> statement-breakpoint

ALTER TABLE briefings_emitted ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE briefings_emitted FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON briefings_emitted
  FOR ALL
  USING (tenant_id = current_setting('app.current_tenant', true))
  WITH CHECK (tenant_id = current_setting('app.current_tenant', true));
--> statement-breakpoint

ALTER TABLE chat_telemetry ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE chat_telemetry FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON chat_telemetry
  FOR ALL
  USING (tenant_id = current_setting('app.current_tenant', true))
  WITH CHECK (tenant_id = current_setting('app.current_tenant', true));
--> statement-breakpoint

ALTER TABLE chat_threads ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE chat_threads FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON chat_threads
  FOR ALL
  USING (tenant_id = current_setting('app.current_tenant', true))
  WITH CHECK (tenant_id = current_setting('app.current_tenant', true));
--> statement-breakpoint

ALTER TABLE chat_tool_telemetry ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE chat_tool_telemetry FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON chat_tool_telemetry
  FOR ALL
  USING (tenant_id = current_setting('app.current_tenant', true))
  WITH CHECK (tenant_id = current_setting('app.current_tenant', true));
--> statement-breakpoint

ALTER TABLE daily_ai_spend ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE daily_ai_spend FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON daily_ai_spend
  FOR ALL
  USING (tenant_id = current_setting('app.current_tenant', true))
  WITH CHECK (tenant_id = current_setting('app.current_tenant', true));
--> statement-breakpoint

ALTER TABLE decision_signal_feedback ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE decision_signal_feedback FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON decision_signal_feedback
  FOR ALL
  USING (tenant_id = current_setting('app.current_tenant', true))
  WITH CHECK (tenant_id = current_setting('app.current_tenant', true));
--> statement-breakpoint

ALTER TABLE decision_signals ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE decision_signals FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON decision_signals
  FOR ALL
  USING (tenant_id = current_setting('app.current_tenant', true))
  WITH CHECK (tenant_id = current_setting('app.current_tenant', true));
--> statement-breakpoint

ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE journal_entries FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON journal_entries
  FOR ALL
  USING (tenant_id = current_setting('app.current_tenant', true))
  WITH CHECK (tenant_id = current_setting('app.current_tenant', true));
--> statement-breakpoint

ALTER TABLE memory_embeddings ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE memory_embeddings FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON memory_embeddings
  FOR ALL
  USING (tenant_id = current_setting('app.current_tenant', true))
  WITH CHECK (tenant_id = current_setting('app.current_tenant', true));
--> statement-breakpoint

ALTER TABLE notification_noise_state ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE notification_noise_state FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON notification_noise_state
  FOR ALL
  USING (tenant_id = current_setting('app.current_tenant', true))
  WITH CHECK (tenant_id = current_setting('app.current_tenant', true));
--> statement-breakpoint

ALTER TABLE portfolio_positions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE portfolio_positions FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON portfolio_positions
  FOR ALL
  USING (tenant_id = current_setting('app.current_tenant', true))
  WITH CHECK (tenant_id = current_setting('app.current_tenant', true));
--> statement-breakpoint

ALTER TABLE portfolio_settings ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE portfolio_settings FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON portfolio_settings
  FOR ALL
  USING (tenant_id = current_setting('app.current_tenant', true))
  WITH CHECK (tenant_id = current_setting('app.current_tenant', true));
--> statement-breakpoint

ALTER TABLE provider_tests ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE provider_tests FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON provider_tests
  FOR ALL
  USING (tenant_id = current_setting('app.current_tenant', true))
  WITH CHECK (tenant_id = current_setting('app.current_tenant', true));
--> statement-breakpoint

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE push_subscriptions FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON push_subscriptions
  FOR ALL
  USING (tenant_id = current_setting('app.current_tenant', true))
  WITH CHECK (tenant_id = current_setting('app.current_tenant', true));
--> statement-breakpoint

ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE rate_limits FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON rate_limits
  FOR ALL
  USING (tenant_id = current_setting('app.current_tenant', true))
  WITH CHECK (tenant_id = current_setting('app.current_tenant', true));
--> statement-breakpoint

ALTER TABLE shared_snapshots ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE shared_snapshots FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON shared_snapshots
  FOR ALL
  USING (tenant_id = current_setting('app.current_tenant', true))
  WITH CHECK (tenant_id = current_setting('app.current_tenant', true));
--> statement-breakpoint

ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE user_sessions FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON user_sessions
  FOR ALL
  USING (tenant_id = current_setting('app.current_tenant', true))
  WITH CHECK (tenant_id = current_setting('app.current_tenant', true));
--> statement-breakpoint

ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE user_settings FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON user_settings
  FOR ALL
  USING (tenant_id = current_setting('app.current_tenant', true))
  WITH CHECK (tenant_id = current_setting('app.current_tenant', true));
--> statement-breakpoint

ALTER TABLE user_symbols ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE user_symbols FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON user_symbols
  FOR ALL
  USING (tenant_id = current_setting('app.current_tenant', true))
  WITH CHECK (tenant_id = current_setting('app.current_tenant', true));
--> statement-breakpoint

-- ── F3 child tables (have tenant_id via denormalization, no direct user_id) ──

ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE chat_messages FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON chat_messages
  FOR ALL
  USING (tenant_id = current_setting('app.current_tenant', true))
  WITH CHECK (tenant_id = current_setting('app.current_tenant', true));
--> statement-breakpoint

ALTER TABLE decision_signal_outcomes ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE decision_signal_outcomes FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON decision_signal_outcomes
  FOR ALL
  USING (tenant_id = current_setting('app.current_tenant', true))
  WITH CHECK (tenant_id = current_setting('app.current_tenant', true));
--> statement-breakpoint

-- ── NextAuth tables (have user_id + tenant_id) ──────────────────────────
-- account and session are NextAuth adapter tables. They do NOT have
-- tenant_id (migration 0039 removes RLS from them). Their RLS blocks
-- are skipped here to avoid breaking the migration chain.

-- RLS on account and session intentionally skipped — they lack tenant_id.
-- Migration 0039 drops any residual policies and disables RLS on them.

-- ── Tables NOT getting RLS (global/shared) ──────────────────────────────
-- These tables are intentionally NOT RLS-protected because they contain
-- shared/global data accessible to all tenants:
--   news_articles, news_embeddings, candles_1m, live_ticks, cot_reports,
--   economic_events, intermarket_resonance, snapshots, symbol_catalog,
--   provider_throttle, cron_runs, verificationToken, organization,
--   organization_member, user (the users table itself — RLS would be
--   circular since the tenant_id on user is the user's own org membership)


