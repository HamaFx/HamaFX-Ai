-- F1: Decision Signal Tracking + Outcome Evaluation
-- Adds three tables: decision_signals, decision_signal_outcomes, decision_signal_feedback

-- Decision signals: every AI directional recommendation
CREATE TABLE IF NOT EXISTS "decision_signals" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
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

CREATE INDEX IF NOT EXISTS "decision_signals_user_idx" ON "decision_signals" ("user_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "decision_signals_symbol_idx" ON "decision_signals" ("symbol", "status");
CREATE INDEX IF NOT EXISTS "decision_signals_active_idx" ON "decision_signals" ("status");

-- Outcomes: forward evaluation results per horizon
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

CREATE UNIQUE INDEX IF NOT EXISTS "decision_signal_outcomes_signal_horizon_idx" ON "decision_signal_outcomes" ("signal_id", "horizon");
CREATE INDEX IF NOT EXISTS "decision_signal_outcomes_signal_idx" ON "decision_signal_outcomes" ("signal_id");

-- User feedback on signals (thumbs up/down)
CREATE TABLE IF NOT EXISTS "decision_signal_feedback" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "signal_id" uuid NOT NULL REFERENCES "decision_signals"("id") ON DELETE CASCADE,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "feedback" text NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "decision_signal_feedback_signal_user_idx" ON "decision_signal_feedback" ("signal_id", "user_id");