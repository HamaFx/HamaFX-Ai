-- Migration 0031: Phase 7 — COMMENT ON TABLE + updated_at trigger function
--
-- Task 37: Add COMMENT ON TABLE for all tables to improve database
--          exploration with tools like pgAdmin, DBeaver, Drizzle Studio.
-- Task 38: Add a Postgres trigger function that auto-updates updated_at
--          on raw SQL updates (e.g. ON CONFLICT DO UPDATE) that bypass
--          Drizzle's .$onUpdate() hook.

-- ── Task 37: COMMENT ON TABLE ─────────────────────────────────────────

COMMENT ON TABLE "user" IS 'NextAuth users — primary identity table';
--> statement-breakpoint
COMMENT ON TABLE "account" IS 'OAuth provider links (NextAuth adapter)';
--> statement-breakpoint
COMMENT ON TABLE "session" IS 'DB-backed sessions (used if strategy=database)';
--> statement-breakpoint
COMMENT ON TABLE "verificationToken" IS 'Magic-link / email verification tokens';
--> statement-breakpoint
COMMENT ON TABLE "user_settings" IS 'Per-user application preferences (BYOK keys, models, notifications)';
--> statement-breakpoint
COMMENT ON TABLE "user_symbols" IS 'Per-user watchlist symbols';
--> statement-breakpoint
COMMENT ON TABLE "user_sessions" IS 'Login tracking for session management UI';
--> statement-breakpoint
COMMENT ON TABLE "chat_threads" IS 'Chat conversation threads';
--> statement-breakpoint
COMMENT ON TABLE "chat_messages" IS 'Individual messages within chat threads';
--> statement-breakpoint
COMMENT ON TABLE "chat_telemetry" IS 'Per-turn AI telemetry (tokens, cost, latency)';
--> statement-breakpoint
COMMENT ON TABLE "chat_tool_telemetry" IS 'Per-tool-call telemetry within a chat turn';
--> statement-breakpoint
COMMENT ON TABLE "agent_opinions" IS 'Multi-agent committee opinions per chat turn';
--> statement-breakpoint
COMMENT ON TABLE "alerts" IS 'User price alerts with rule definitions and channels';
--> statement-breakpoint
COMMENT ON TABLE "journal_entries" IS 'Trading journal entries (trades, outcomes, notes)';
--> statement-breakpoint
COMMENT ON TABLE "news_articles" IS 'Cached news articles (deduped by sha1(url))';
--> statement-breakpoint
COMMENT ON TABLE "news_embeddings" IS 'pgvector embeddings for news articles';
--> statement-breakpoint
COMMENT ON TABLE "economic_events" IS 'Economic calendar events';
--> statement-breakpoint
COMMENT ON TABLE "snapshots" IS 'Market data snapshots (daily/weekly OHLCV etc.)';
--> statement-breakpoint
COMMENT ON TABLE "briefings_emitted" IS 'Idempotency log for pre/post market briefings';
--> statement-breakpoint
COMMENT ON TABLE "cot_reports" IS 'Commitment of Traders reports (CFTC positioning data)';
--> statement-breakpoint
COMMENT ON TABLE "shared_snapshots" IS 'User-shared snapshot links';
--> statement-breakpoint
COMMENT ON TABLE "push_subscriptions" IS 'Web Push notification subscriptions';
--> statement-breakpoint
COMMENT ON TABLE "memory_embeddings" IS 'Unified memory index (journal, briefings, thread synopses)';
--> statement-breakpoint
COMMENT ON TABLE "daily_ai_spend" IS 'Daily AI spend tracking per user';
--> statement-breakpoint
COMMENT ON TABLE "rate_limits" IS 'Rate limiting counters per user per action';
--> statement-breakpoint
COMMENT ON TABLE "live_ticks" IS 'Live market ticks (high-frequency, short retention)';
--> statement-breakpoint
COMMENT ON TABLE "candles_1m" IS '1-minute OHLCV candles (14-day retention)';
--> statement-breakpoint
COMMENT ON TABLE "provider_throttle" IS 'Provider API throttle state';
--> statement-breakpoint
COMMENT ON TABLE "intermarket_resonance" IS 'Intermarket correlation/resonance analysis';
--> statement-breakpoint
COMMENT ON TABLE "audit_logs" IS 'Audit trail for sensitive actions';
--> statement-breakpoint
COMMENT ON TABLE "provider_tests" IS 'AI provider health check results';
--> statement-breakpoint
COMMENT ON TABLE "symbol_catalog" IS 'Catalog of all known trading symbols';
--> statement-breakpoint
COMMENT ON TABLE "cron_runs" IS 'Cron job execution idempotency guard';
--> statement-breakpoint
COMMENT ON TABLE "decision_signals" IS 'AI directional recommendations (buy/sell/hold)';
--> statement-breakpoint
COMMENT ON TABLE "decision_signal_outcomes" IS 'Forward evaluation results for decision signals';
--> statement-breakpoint
COMMENT ON TABLE "decision_signal_feedback" IS 'User thumbs-up/down on decision signals';
--> statement-breakpoint
COMMENT ON TABLE "portfolio_positions" IS 'Forex/XAU positions with lot sizes and entry/stop/target';
--> statement-breakpoint
COMMENT ON TABLE "portfolio_settings" IS 'Per-user account balance and risk limits';
--> statement-breakpoint
COMMENT ON TABLE "notification_noise_state" IS 'Notification deduplication/throttling state';
--> statement-breakpoint
COMMENT ON TABLE "bot_links" IS 'Telegram/Discord/Slack chat ID to user mapping';
--> statement-breakpoint

-- ── Task 38: updated_at trigger function ──────────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

-- Attach the trigger to tables that have updated_at and are updated
-- via raw SQL (ON CONFLICT DO UPDATE) in addition to Drizzle ORM.

DROP TRIGGER IF EXISTS trg_updated_at_user ON "user";
--> statement-breakpoint
CREATE TRIGGER trg_updated_at_user
  BEFORE UPDATE ON "user"
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
--> statement-breakpoint

DROP TRIGGER IF EXISTS trg_updated_at_user_settings ON "user_settings";
--> statement-breakpoint
CREATE TRIGGER trg_updated_at_user_settings
  BEFORE UPDATE ON "user_settings"
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
--> statement-breakpoint

DROP TRIGGER IF EXISTS trg_updated_at_chat_threads ON "chat_threads";
--> statement-breakpoint
CREATE TRIGGER trg_updated_at_chat_threads
  BEFORE UPDATE ON "chat_threads"
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
--> statement-breakpoint

DROP TRIGGER IF EXISTS trg_updated_at_journal_entries ON "journal_entries";
--> statement-breakpoint
CREATE TRIGGER trg_updated_at_journal_entries
  BEFORE UPDATE ON "journal_entries"
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
--> statement-breakpoint

DROP TRIGGER IF EXISTS trg_updated_at_portfolio_positions ON "portfolio_positions";
--> statement-breakpoint
CREATE TRIGGER trg_updated_at_portfolio_positions
  BEFORE UPDATE ON "portfolio_positions"
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
--> statement-breakpoint

DROP TRIGGER IF EXISTS trg_updated_at_portfolio_settings ON "portfolio_settings";
--> statement-breakpoint
CREATE TRIGGER trg_updated_at_portfolio_settings
  BEFORE UPDATE ON "portfolio_settings"
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
--> statement-breakpoint

DROP TRIGGER IF EXISTS trg_updated_at_decision_signals ON "decision_signals";
--> statement-breakpoint
CREATE TRIGGER trg_updated_at_decision_signals
  BEFORE UPDATE ON "decision_signals"
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();