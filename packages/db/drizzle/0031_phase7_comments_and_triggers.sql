-- Migration 0031: Phase 7 — COMMENT ON TABLE + updated_at trigger function
--
-- Task 37: Add COMMENT ON TABLE for all tables to improve database
--          exploration with tools like pgAdmin, DBeaver, Drizzle Studio.
-- Task 38: Add a Postgres trigger function that auto-updates updated_at
--          on raw SQL updates (e.g. ON CONFLICT DO UPDATE) that bypass
--          Drizzle's .$onUpdate() hook.

-- ── Task 37: COMMENT ON TABLE ─────────────────────────────────────────

COMMENT ON TABLE "user" IS 'NextAuth users — primary identity table';
COMMENT ON TABLE "account" IS 'OAuth provider links (NextAuth adapter)';
COMMENT ON TABLE "session" IS 'DB-backed sessions (used if strategy=database)';
COMMENT ON TABLE "verificationToken" IS 'Magic-link / email verification tokens';
COMMENT ON TABLE "user_settings" IS 'Per-user application preferences (BYOK keys, models, notifications)';
COMMENT ON TABLE "user_symbols" IS 'Per-user watchlist symbols';
COMMENT ON TABLE "user_sessions" IS 'Login tracking for session management UI';
COMMENT ON TABLE "chat_threads" IS 'Chat conversation threads';
COMMENT ON TABLE "chat_messages" IS 'Individual messages within chat threads';
COMMENT ON TABLE "chat_telemetry" IS 'Per-turn AI telemetry (tokens, cost, latency)';
COMMENT ON TABLE "chat_tool_telemetry" IS 'Per-tool-call telemetry within a chat turn';
COMMENT ON TABLE "agent_opinions" IS 'Multi-agent committee opinions per chat turn';
COMMENT ON TABLE "alerts" IS 'User price alerts with rule definitions and channels';
COMMENT ON TABLE "journal_entries" IS 'Trading journal entries (trades, outcomes, notes)';
COMMENT ON TABLE "news_articles" IS 'Cached news articles (deduped by sha1(url))';
COMMENT ON TABLE "news_embeddings" IS 'pgvector embeddings for news articles';
COMMENT ON TABLE "calendar_events" IS 'Economic calendar events';
COMMENT ON TABLE "snapshots" IS 'Market data snapshots (daily/weekly OHLCV etc.)';
COMMENT ON TABLE "briefings_emitted" IS 'Idempotency log for pre/post market briefings';
COMMENT ON TABLE "cot_reports" IS 'Commitment of Traders reports (CFTC positioning data)';
COMMENT ON TABLE "shared_snapshots" IS 'User-shared snapshot links';
COMMENT ON TABLE "push_subscriptions" IS 'Web Push notification subscriptions';
COMMENT ON TABLE "memory_embeddings" IS 'Unified memory index (journal, briefings, thread synopses)';
COMMENT ON TABLE "daily_ai_spend" IS 'Daily AI spend tracking per user';
COMMENT ON TABLE "rate_limits" IS 'Rate limiting counters per user per action';
COMMENT ON TABLE "live_ticks" IS 'Live market ticks (high-frequency, short retention)';
COMMENT ON TABLE "candles_1m" IS '1-minute OHLCV candles (14-day retention)';
COMMENT ON TABLE "throttle" IS 'Provider API throttle state';
COMMENT ON TABLE "intermarket_resonance" IS 'Intermarket correlation/resonance analysis';
COMMENT ON TABLE "audit_logs" IS 'Audit trail for sensitive actions';
COMMENT ON TABLE "provider_tests" IS 'AI provider health check results';
COMMENT ON TABLE "symbol_catalog" IS 'Catalog of all known trading symbols';
COMMENT ON TABLE "cron_runs" IS 'Cron job execution idempotency guard';
COMMENT ON TABLE "decision_signals" IS 'AI directional recommendations (buy/sell/hold)';
COMMENT ON TABLE "decision_signal_outcomes" IS 'Forward evaluation results for decision signals';
COMMENT ON TABLE "decision_signal_feedback" IS 'User thumbs-up/down on decision signals';
COMMENT ON TABLE "portfolio_positions" IS 'Forex/XAU positions with lot sizes and entry/stop/target';
COMMENT ON TABLE "portfolio_settings" IS 'Per-user account balance and risk limits';
COMMENT ON TABLE "notification_noise_state" IS 'Notification deduplication/throttling state';
COMMENT ON TABLE "bot_links" IS 'Telegram/Discord/Slack chat ID to user mapping';

-- ── Task 38: updated_at trigger function ──────────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Attach the trigger to tables that have updated_at and are updated
-- via raw SQL (ON CONFLICT DO UPDATE) in addition to Drizzle ORM.

DROP TRIGGER IF EXISTS trg_updated_at_user ON "user";
CREATE TRIGGER trg_updated_at_user
  BEFORE UPDATE ON "user"
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_updated_at_user_settings ON "user_settings";
CREATE TRIGGER trg_updated_at_user_settings
  BEFORE UPDATE ON "user_settings"
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_updated_at_chat_threads ON "chat_threads";
CREATE TRIGGER trg_updated_at_chat_threads
  BEFORE UPDATE ON "chat_threads"
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_updated_at_journal_entries ON "journal_entries";
CREATE TRIGGER trg_updated_at_journal_entries
  BEFORE UPDATE ON "journal_entries"
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_updated_at_portfolio_positions ON "portfolio_positions";
CREATE TRIGGER trg_updated_at_portfolio_positions
  BEFORE UPDATE ON "portfolio_positions"
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_updated_at_portfolio_settings ON "portfolio_settings";
CREATE TRIGGER trg_updated_at_portfolio_settings
  BEFORE UPDATE ON "portfolio_settings"
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_updated_at_decision_signals ON "decision_signals";
CREATE TRIGGER trg_updated_at_decision_signals
  BEFORE UPDATE ON "decision_signals"
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();