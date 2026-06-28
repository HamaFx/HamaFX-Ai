-- F1: Decision Signal Tracking + Outcome Evaluation
-- Adds three tables: decision_signals, decision_signal_outcomes, decision_signal_feedback

-- Decision signals: every AI directional recommendation
CREATE TABLE IF NOT EXISTS "decision_signals" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "thread_id" uuid REFERENCES "chat_threads"("id") ON DELETE SET NULL,
  "message_id" uuid REFERENCES "chat_messages"("id") ON DELETE SET NULL,
  "symbol" text NOT NULL,
  "action" text NOT NULL,
  "bias" text NOT NULL,
  "confidence" real,
  "entry_low" double precision,
  "entry_high" double precision,
  "stop_loss" double precision,
  "take_profit" double precision,
  "horizon" text NOT NULL,
  "anchor_price" double precision NOT NULL,
  "anchor_at" timestamptz NOT NULL,
  "source_type" text NOT NULL,
  "model" text,
  "analysis_mode" text,
  "status" text NOT NULL DEFAULT 'active',
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "decision_signals_user_idx" ON "decision_signals" ("user_id", "created_at" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "decision_signals_symbol_idx" ON "decision_signals" ("symbol", "status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "decision_signals_active_idx" ON "decision_signals" ("status");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "decision_signal_outcomes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "signal_id" uuid NOT NULL REFERENCES "decision_signals"("id") ON DELETE CASCADE,
  "horizon" text NOT NULL,
  "eval_status" text NOT NULL,
  "unable_reason" text,
  "outcome" text,
  "direction_correct" boolean,
  "price_return_pct" real,
  "hit_stop_loss" boolean,
  "hit_take_profit" boolean,
  "first_hit" text,
  "first_hit_days" integer,
  "end_price" double precision,
  "evaluated_at" timestamptz DEFAULT now() NOT NULL,
  "engine_version" text NOT NULL DEFAULT 'v1'
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "decision_signal_outcomes_signal_horizon_idx" ON "decision_signal_outcomes" ("signal_id", "horizon");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "decision_signal_outcomes_signal_idx" ON "decision_signal_outcomes" ("signal_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "decision_signal_feedback" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "signal_id" uuid NOT NULL REFERENCES "decision_signals"("id") ON DELETE CASCADE,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "feedback" text NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "decision_signal_feedback_signal_user_idx" ON "decision_signal_feedback" ("signal_id", "user_id");
--> statement-breakpoint

-- Create Q2/Q3 feature tables that were missing migration SQL:
-- portfolio_positions, portfolio_settings, notification_noise_state, bot_links

CREATE TABLE IF NOT EXISTS "portfolio_positions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "symbol" text NOT NULL,
  "direction" text NOT NULL,
  "lot_size" double precision NOT NULL,
  "entry_price" double precision NOT NULL,
  "stop_loss" double precision,
  "take_profit" double precision,
  "opened_at" timestamptz NOT NULL,
  "closed_at" timestamptz,
  "close_price" double precision,
  "status" text DEFAULT 'open' NOT NULL,
  "notes" text,
  "linked_signal_id" uuid REFERENCES "decision_signals"("id") ON DELETE SET NULL,
  "deleted_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "portfolio_positions_user_status_idx" ON "portfolio_positions" ("user_id", "status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "portfolio_positions_symbol_idx" ON "portfolio_positions" ("symbol", "status");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "portfolio_settings" (
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "account_balance" double precision,
  "base_currency" text DEFAULT 'USD' NOT NULL,
  "max_risk_per_trade_pct" real DEFAULT 2.0 NOT NULL,
  "max_total_exposure_pct" real DEFAULT 10.0 NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "portfolio_settings_user_idx" ON "portfolio_settings" ("user_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "notification_noise_state" (
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "dedup_key" text NOT NULL,
  "route_type" text NOT NULL,
  "last_sent_at" timestamptz NOT NULL,
  "expires_at" timestamptz NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "notification_noise_state_user_dedup_idx" ON "notification_noise_state" ("user_id", "dedup_key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notification_noise_state_expires_idx" ON "notification_noise_state" ("expires_at");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "bot_links" (
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "platform" text NOT NULL,
  "chat_id" text NOT NULL,
  "linked_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "bot_links_platform_chat_id_pk" PRIMARY KEY ("platform", "chat_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bot_links_user_idx" ON "bot_links" ("user_id", "platform");