DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'bot_platform') THEN CREATE TYPE "public"."bot_platform" AS ENUM('telegram', 'discord', 'slack'); END IF; END$$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'briefing_kind') THEN CREATE TYPE "public"."briefing_kind" AS ENUM('pre', 'post', 'weekly_review'); END IF; END$$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'journal_outcome') THEN CREATE TYPE "public"."journal_outcome" AS ENUM('open', 'win', 'loss', 'breakeven'); END IF; END$$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'portfolio_status') THEN CREATE TYPE "public"."portfolio_status" AS ENUM('open', 'closed'); END IF; END$$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'signal_action') THEN CREATE TYPE "public"."signal_action" AS ENUM('buy', 'sell', 'hold', 'reduce', 'add', 'avoid'); END IF; END$$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'signal_bias') THEN CREATE TYPE "public"."signal_bias" AS ENUM('bullish', 'bearish', 'neutral'); END IF; END$$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'signal_eval_status') THEN CREATE TYPE "public"."signal_eval_status" AS ENUM('completed', 'unable'); END IF; END$$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'signal_feedback') THEN CREATE TYPE "public"."signal_feedback" AS ENUM('useful', 'not_useful'); END IF; END$$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'signal_horizon') THEN CREATE TYPE "public"."signal_horizon" AS ENUM('intraday', '1d', '3d', '5d', '10d', 'swing'); END IF; END$$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'signal_outcome') THEN CREATE TYPE "public"."signal_outcome" AS ENUM('hit', 'miss', 'neutral'); END IF; END$$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'signal_source') THEN CREATE TYPE "public"."signal_source" AS ENUM('chat', 'alert', 'briefing', 'manual'); END IF; END$$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'signal_status') THEN CREATE TYPE "public"."signal_status" AS ENUM('active', 'expired', 'invalidated', 'closed'); END IF; END$$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN CREATE TYPE "public"."user_role" AS ENUM('user', 'admin'); END IF; END$$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_status') THEN CREATE TYPE "public"."payment_status" AS ENUM('waiting', 'confirming', 'confirmed', 'sending', 'finished', 'failed', 'expired', 'refunded'); END IF; END$$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'plan_interval') THEN CREATE TYPE "public"."plan_interval" AS ENUM('monthly', 'quarterly', 'yearly'); END IF; END$$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'subscription_status') THEN CREATE TYPE "public"."subscription_status" AS ENUM('trialing', 'active', 'past_due', 'canceled', 'expired'); END IF; END$$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "account" (
	"userId" text NOT NULL,
	"type" text NOT NULL,
	"provider" text NOT NULL,
	"providerAccountId" text NOT NULL,
	"refresh_token" text,
	"access_token" text,
	"expires_at" integer,
	"token_type" text,
	"scope" text,
	"id_token" text,
	"session_state" text,
	CONSTRAINT "account_provider_providerAccountId_pk" PRIMARY KEY("provider","providerAccountId")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "organization" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"plan" text DEFAULT 'free' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "organization_member" (
	"org_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_member_org_id_user_id_pk" PRIMARY KEY("org_id","user_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "session" (
	"sessionToken" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"expires" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"tenant_id" text DEFAULT current_setting('app.current_tenant', true) NOT NULL,
	"device_name" text,
	"ip" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_active_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_settings" (
	"user_id" text PRIMARY KEY NOT NULL,
	"tenant_id" text DEFAULT current_setting('app.current_tenant', true) NOT NULL,
	"default_symbol" text DEFAULT 'XAUUSD' NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"language" text DEFAULT 'en' NOT NULL,
	"reduce_motion" boolean DEFAULT false NOT NULL,
	"telegram_bot_token" text,
	"telegram_chat_id" text,
	"alert_email" text,
	"ai_api_keys" text,
	"default_models" jsonb,
	"chat_model" text,
	"vision_model" text,
	"embedding_model" text,
	"ai_fallback_chain" jsonb,
	"max_daily_usd" integer,
	"monthly_budget_limit" integer,
	"provider_spending_thresholds" jsonb,
	"spend_alerts_config" jsonb,
	"spend_alerts_state" jsonb,
	"ai_api_keys_updated_at" jsonb,
	"market_data_provider" text DEFAULT 'biquote' NOT NULL,
	"theme" text,
	"notification_preferences" jsonb,
	"custom_instructions" text,
	"time_format" text,
	"disabled_tools" jsonb,
	"onboarding_completed" boolean DEFAULT false NOT NULL,
	"onboarding_progress" jsonb,
	"default_analysis_mode" text DEFAULT 'auto',
	"show_agent_opinions" boolean DEFAULT true NOT NULL,
	"agent_model_overrides" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_symbols" (
	"user_id" text NOT NULL,
	"tenant_id" text DEFAULT current_setting('app.current_tenant', true) NOT NULL,
	"symbol" text NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_symbols_user_id_symbol_pk" PRIMARY KEY("user_id","symbol")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"email" text NOT NULL,
	"emailVerified" timestamp with time zone,
	"image" text,
	"hashedPassword" text,
	"role" text DEFAULT 'user' NOT NULL,
	"deletedAt" timestamp with time zone,
	"tokenVersion" integer DEFAULT 0 NOT NULL,
	"two_factor_secret" text,
	"two_factor_enabled" boolean DEFAULT false NOT NULL,
	"failed_login_attempts" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "verificationToken" (
	"identifier" text NOT NULL,
	"token" text NOT NULL,
	"expires" timestamp with time zone NOT NULL,
	CONSTRAINT "verificationToken_identifier_token_pk" PRIMARY KEY("identifier","token"),
	CONSTRAINT "verificationToken_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "chat_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"thread_id" uuid NOT NULL,
	"tenant_id" text DEFAULT current_setting('app.current_tenant', true) NOT NULL,
	"role" text NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"parts" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "chat_threads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"title" text,
	"tenant_id" text DEFAULT current_setting('app.current_tenant', true) NOT NULL,
	"pinned_symbol" text,
	"model_override" text,
	"title_source" text,
	"is_briefings" boolean DEFAULT false NOT NULL,
	"analysis_mode" text DEFAULT 'single',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "agent_opinions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"thread_id" uuid NOT NULL,
	"tenant_id" text DEFAULT current_setting('app.current_tenant', true) NOT NULL,
	"message_id" uuid NOT NULL,
	"agent_name" text NOT NULL,
	"bias" text NOT NULL,
	"confidence" real NOT NULL,
	"reasoning" text NOT NULL,
	"raw_data" jsonb NOT NULL,
	"model" text NOT NULL,
	"cost_usd" real NOT NULL,
	"latency_ms" integer NOT NULL,
	"analysis_mode" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"rule" jsonb NOT NULL,
	"tenant_id" text DEFAULT current_setting('app.current_tenant', true) NOT NULL,
	"channels" text[] DEFAULT '{"email"}' NOT NULL,
	"note" text,
	"active" boolean DEFAULT true NOT NULL,
	"fired_at" timestamp with time zone,
	"last_fired_at" timestamp with time zone,
	"snooze_hours" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "journal_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"symbol" text NOT NULL,
	"tenant_id" text DEFAULT current_setting('app.current_tenant', true) NOT NULL,
	"side" text NOT NULL,
	"opened_at" timestamp with time zone NOT NULL,
	"closed_at" timestamp with time zone,
	"entry" double precision NOT NULL,
	"stop" double precision,
	"target" double precision,
	"exit" double precision,
	"size" double precision,
	"outcome" text DEFAULT 'open' NOT NULL,
	"r_multiple" double precision,
	"notes" text,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"screenshot_url" text,
	"attachments" text[] DEFAULT '{}'::text[] NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "news_articles" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"summary" text,
	"url" text NOT NULL,
	"source" text NOT NULL,
	"publisher" text,
	"published_at" timestamp with time zone NOT NULL,
	"symbols" text[] DEFAULT '{}'::text[] NOT NULL,
	"sentiment" text,
	"sentiment_score" double precision,
	"topics" text[] DEFAULT '{}'::text[] NOT NULL,
	"tenant_id" text DEFAULT '__system__',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "news_articles_url_unique" UNIQUE("url")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "news_embeddings" (
	"article_id" text PRIMARY KEY NOT NULL,
	"model" text NOT NULL,
	"embedding" vector(1536) NOT NULL,
	"tenant_id" text DEFAULT '__system__',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "economic_events" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"country" text NOT NULL,
	"currency" text,
	"importance" text NOT NULL,
	"date" timestamp with time zone NOT NULL,
	"actual" double precision,
	"forecast" double precision,
	"previous" double precision,
	"unit" text,
	"source" text NOT NULL,
	"actuals_filled_at" timestamp with time zone,
	"tenant_id" text DEFAULT '__system__',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"symbol" text NOT NULL,
	"kind" text NOT NULL,
	"as_of" timestamp with time zone NOT NULL,
	"data" jsonb NOT NULL,
	"tenant_id" text DEFAULT '__system__',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "snapshots_symbol_kind_asof_uk" UNIQUE("symbol","kind","as_of")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "chat_telemetry" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"thread_id" uuid,
	"tenant_id" text DEFAULT current_setting('app.current_tenant', true) NOT NULL,
	"message_id" uuid,
	"model" text NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"tool_calls" integer DEFAULT 0 NOT NULL,
	"ms" integer DEFAULT 0 NOT NULL,
	"est_cost_usd" double precision DEFAULT 0 NOT NULL,
	"kind" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "chat_tool_telemetry" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"thread_id" uuid,
	"tenant_id" text DEFAULT current_setting('app.current_tenant', true) NOT NULL,
	"message_id" uuid,
	"tool" text NOT NULL,
	"ms" integer DEFAULT 0 NOT NULL,
	"ok" boolean DEFAULT true NOT NULL,
	"error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "briefings_emitted" (
	"user_id" text NOT NULL,
	"tenant_id" text DEFAULT current_setting('app.current_tenant', true) NOT NULL,
	"event_id" text NOT NULL,
	"kind" text NOT NULL,
	"message_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "briefings_emitted_user_id_event_id_kind_pk" PRIMARY KEY("user_id","event_id","kind")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "cot_reports" (
	"id" text PRIMARY KEY NOT NULL,
	"symbol" text NOT NULL,
	"report_date" timestamp with time zone NOT NULL,
	"dealer_long" bigint,
	"dealer_short" bigint,
	"asset_long" bigint,
	"asset_short" bigint,
	"leveraged_long" bigint,
	"leveraged_short" bigint,
	"other_long" bigint,
	"other_short" bigint,
	"source" text NOT NULL,
	"raw" jsonb,
	"tenant_id" text DEFAULT '__system__',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "shared_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"tenant_id" text DEFAULT current_setting('app.current_tenant', true) NOT NULL,
	"body" text NOT NULL,
	"overlay" jsonb,
	"symbol" text,
	"tf" text,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "push_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"endpoint" text NOT NULL,
	"tenant_id" text DEFAULT current_setting('app.current_tenant', true) NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "push_subscriptions_endpoint_unique" UNIQUE("endpoint")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "memory_embeddings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"tenant_id" text DEFAULT current_setting('app.current_tenant', true) NOT NULL,
	"source_id" text NOT NULL,
	"symbol" text,
	"text" text NOT NULL,
	"model" text NOT NULL,
	"meta" jsonb,
	"embedding" vector(1536) NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "memory_embeddings_user_kind_source_uk" UNIQUE("user_id","kind","source_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "daily_ai_spend" (
	"user_id" text NOT NULL,
	"tenant_id" text DEFAULT current_setting('app.current_tenant', true) NOT NULL,
	"day" date NOT NULL,
	"total_usd_cents" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "daily_ai_spend_user_id_day_pk" PRIMARY KEY("user_id","day")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "rate_limits" (
	"user_id" text NOT NULL,
	"tenant_id" text DEFAULT current_setting('app.current_tenant', true) NOT NULL,
	"endpoint_group" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"request_count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "rate_limits_user_id_endpoint_group_window_start_pk" PRIMARY KEY("user_id","endpoint_group","window_start")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "live_ticks" (
	"symbol" text PRIMARY KEY NOT NULL,
	"bid" double precision NOT NULL,
	"ask" double precision NOT NULL,
	"mid" double precision NOT NULL,
	"ts" timestamp with time zone NOT NULL,
	"source" text NOT NULL,
	"tenant_id" text DEFAULT '__system__',
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "candles_1m" (
	"symbol" text NOT NULL,
	"t" timestamp with time zone NOT NULL,
	"o" double precision NOT NULL,
	"h" double precision NOT NULL,
	"l" double precision NOT NULL,
	"c" double precision NOT NULL,
	"v" double precision,
	"tick_volume" integer NOT NULL,
	"source" text DEFAULT 'biquote-signalr' NOT NULL,
	"tenant_id" text DEFAULT '__system__',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "candles_1m_symbol_t_pk" PRIMARY KEY("symbol","t")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "provider_throttle" (
	"provider" text PRIMARY KEY NOT NULL,
	"window_started_at" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"backoff_until" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "intermarket_resonance" (
	"date" date PRIMARY KEY NOT NULL,
	"real_yield_pct" double precision,
	"breakeven_inflation_pct" double precision,
	"dxy_index" double precision,
	"gold_close" double precision,
	"divergence_score" double precision,
	"tenant_id" text DEFAULT '__system__',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "audit_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"tenant_id" text DEFAULT current_setting('app.current_tenant', true) NOT NULL,
	"action" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "provider_tests" (
	"user_id" text NOT NULL,
	"tenant_id" text DEFAULT current_setting('app.current_tenant', true) NOT NULL,
	"provider_id" text NOT NULL,
	"ok" boolean NOT NULL,
	"error" text,
	"tested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"rate_limit" jsonb,
	CONSTRAINT "provider_tests_user_id_provider_id_pk" PRIMARY KEY("user_id","provider_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "symbol_catalog" (
	"symbol" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"exchange" text,
	"tv_ticker" text,
	"twelve_data_symbol" text,
	"biquote_symbol" text,
	"binance_symbol" text,
	"finnhub_symbol" text,
	"n_data_symbol" text,
	"pip_size" real,
	"price_decimals" integer,
	"currency_tags" text[],
	"is_active" boolean DEFAULT true,
	"sort_order" integer DEFAULT 0,
	"tenant_id" text DEFAULT '__system__'
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "cron_runs" (
	"job_name" text NOT NULL,
	"run_date" date NOT NULL,
	"status" text DEFAULT 'started' NOT NULL,
	"note" text,
	"tenant_id" text DEFAULT '__system__',
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "cron_runs_pkey" PRIMARY KEY("job_name","run_date")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "diagnostic_traces" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"thread_id" text,
	"started_at" timestamp with time zone NOT NULL,
	"duration_ms" integer,
	"step_count" integer DEFAULT 0 NOT NULL,
	"error_count" integer DEFAULT 0 NOT NULL,
	"status" text NOT NULL,
	"summary" text,
	"metadata" jsonb,
	"trace" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "feature_flags" (
	"key" text PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "decision_signal_feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"signal_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"feedback" text NOT NULL,
	"tenant_id" text DEFAULT current_setting('app.current_tenant', true) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "decision_signal_outcomes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"signal_id" uuid NOT NULL,
	"tenant_id" text DEFAULT current_setting('app.current_tenant', true) NOT NULL,
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
	"evaluated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"engine_version" text DEFAULT 'v1' NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "decision_signals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"thread_id" uuid,
	"tenant_id" text DEFAULT current_setting('app.current_tenant', true) NOT NULL,
	"message_id" uuid,
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
	"anchor_at" timestamp with time zone NOT NULL,
	"source_type" text NOT NULL,
	"model" text,
	"analysis_mode" text,
	"status" text DEFAULT 'active' NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "portfolio_positions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"symbol" text NOT NULL,
	"tenant_id" text DEFAULT current_setting('app.current_tenant', true) NOT NULL,
	"direction" text NOT NULL,
	"lot_size" double precision NOT NULL,
	"entry_price" double precision NOT NULL,
	"stop_loss" double precision,
	"take_profit" double precision,
	"opened_at" timestamp with time zone NOT NULL,
	"closed_at" timestamp with time zone,
	"close_price" double precision,
	"status" text DEFAULT 'open' NOT NULL,
	"notes" text,
	"linked_signal_id" uuid,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "portfolio_settings" (
	"user_id" text NOT NULL,
	"tenant_id" text DEFAULT current_setting('app.current_tenant', true) NOT NULL,
	"account_balance" double precision,
	"base_currency" text DEFAULT 'USD' NOT NULL,
	"max_risk_per_trade_pct" real DEFAULT 2 NOT NULL,
	"max_total_exposure_pct" real DEFAULT 10 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "notification_noise_state" (
	"user_id" text NOT NULL,
	"dedup_key" text NOT NULL,
	"tenant_id" text DEFAULT current_setting('app.current_tenant', true) NOT NULL,
	"route_type" text NOT NULL,
	"last_sent_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "bot_links" (
	"user_id" text NOT NULL,
	"tenant_id" text DEFAULT current_setting('app.current_tenant', true) NOT NULL,
	"platform" text NOT NULL,
	"chat_id" text NOT NULL,
	"linked_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bot_links_platform_chat_id_pk" PRIMARY KEY("platform","chat_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ipn_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nowpayments_payment_id" text NOT NULL,
	"payment_status" text NOT NULL,
	"body_hash" text NOT NULL,
	"raw_body" jsonb NOT NULL,
	"processed" boolean DEFAULT false NOT NULL,
	"error" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subscription_id" uuid,
	"tenant_id" text DEFAULT current_setting('app.current_tenant', true) NOT NULL,
	"nowpayments_payment_id" text NOT NULL,
	"nowpayments_invoice_id" text,
	"status" "payment_status" DEFAULT 'waiting' NOT NULL,
	"pay_amount" text,
	"pay_currency" text,
	"usd_amount_cents" integer,
	"tx_hash" text,
	"ipn_payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_nowpayments_payment_id_unique" UNIQUE("nowpayments_payment_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"nowpayments_plan_id" text,
	"price_usd_cents" integer DEFAULT 0 NOT NULL,
	"pay_currency" text DEFAULT 'usdt',
	"interval" "plan_interval" DEFAULT 'monthly' NOT NULL,
	"features" jsonb DEFAULT '[]'::jsonb,
	"monthly_token_cap" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" text DEFAULT current_setting('app.current_tenant', true) NOT NULL,
	"plan_id" uuid NOT NULL,
	"status" "subscription_status" DEFAULT 'active' NOT NULL,
	"nowpayments_recurring_id" text,
	"nowpayments_invoice_id" text,
	"current_period_end" timestamp with time zone,
	"trial_end" timestamp with time zone,
	"canceled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'account_userId_user_id_fk') THEN ALTER TABLE "account" ADD CONSTRAINT "account_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action; END IF; END$$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'organization_member_org_id_organization_id_fk') THEN ALTER TABLE "organization_member" ADD CONSTRAINT "organization_member_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action; END IF; END$$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'organization_member_user_id_user_id_fk') THEN ALTER TABLE "organization_member" ADD CONSTRAINT "organization_member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action; END IF; END$$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'session_userId_user_id_fk') THEN ALTER TABLE "session" ADD CONSTRAINT "session_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action; END IF; END$$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_sessions_user_id_user_id_fk') THEN ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action; END IF; END$$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_sessions_tenant_id_organization_id_fk') THEN ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_tenant_id_organization_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action; END IF; END$$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_settings_user_id_user_id_fk') THEN ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action; END IF; END$$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_settings_tenant_id_organization_id_fk') THEN ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_tenant_id_organization_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action; END IF; END$$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_symbols_user_id_user_id_fk') THEN ALTER TABLE "user_symbols" ADD CONSTRAINT "user_symbols_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action; END IF; END$$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_symbols_tenant_id_organization_id_fk') THEN ALTER TABLE "user_symbols" ADD CONSTRAINT "user_symbols_tenant_id_organization_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action; END IF; END$$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chat_messages_thread_id_chat_threads_id_fk') THEN ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_thread_id_chat_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."chat_threads"("id") ON DELETE cascade ON UPDATE no action; END IF; END$$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chat_messages_tenant_id_organization_id_fk') THEN ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_tenant_id_organization_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action; END IF; END$$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chat_threads_user_id_user_id_fk') THEN ALTER TABLE "chat_threads" ADD CONSTRAINT "chat_threads_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action; END IF; END$$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chat_threads_tenant_id_organization_id_fk') THEN ALTER TABLE "chat_threads" ADD CONSTRAINT "chat_threads_tenant_id_organization_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action; END IF; END$$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'agent_opinions_user_id_user_id_fk') THEN ALTER TABLE "agent_opinions" ADD CONSTRAINT "agent_opinions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action; END IF; END$$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'agent_opinions_thread_id_chat_threads_id_fk') THEN ALTER TABLE "agent_opinions" ADD CONSTRAINT "agent_opinions_thread_id_chat_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."chat_threads"("id") ON DELETE cascade ON UPDATE no action; END IF; END$$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'agent_opinions_tenant_id_organization_id_fk') THEN ALTER TABLE "agent_opinions" ADD CONSTRAINT "agent_opinions_tenant_id_organization_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action; END IF; END$$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'agent_opinions_message_id_chat_messages_id_fk') THEN ALTER TABLE "agent_opinions" ADD CONSTRAINT "agent_opinions_message_id_chat_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."chat_messages"("id") ON DELETE cascade ON UPDATE no action; END IF; END$$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'alerts_user_id_user_id_fk') THEN ALTER TABLE "alerts" ADD CONSTRAINT "alerts_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action; END IF; END$$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'alerts_tenant_id_organization_id_fk') THEN ALTER TABLE "alerts" ADD CONSTRAINT "alerts_tenant_id_organization_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action; END IF; END$$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'journal_entries_user_id_user_id_fk') THEN ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action; END IF; END$$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'journal_entries_tenant_id_organization_id_fk') THEN ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_tenant_id_organization_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action; END IF; END$$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'news_embeddings_article_id_news_articles_id_fk') THEN ALTER TABLE "news_embeddings" ADD CONSTRAINT "news_embeddings_article_id_news_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."news_articles"("id") ON DELETE cascade ON UPDATE no action; END IF; END$$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chat_telemetry_user_id_user_id_fk') THEN ALTER TABLE "chat_telemetry" ADD CONSTRAINT "chat_telemetry_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action; END IF; END$$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chat_telemetry_tenant_id_organization_id_fk') THEN ALTER TABLE "chat_telemetry" ADD CONSTRAINT "chat_telemetry_tenant_id_organization_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action; END IF; END$$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chat_tool_telemetry_user_id_user_id_fk') THEN ALTER TABLE "chat_tool_telemetry" ADD CONSTRAINT "chat_tool_telemetry_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action; END IF; END$$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chat_tool_telemetry_tenant_id_organization_id_fk') THEN ALTER TABLE "chat_tool_telemetry" ADD CONSTRAINT "chat_tool_telemetry_tenant_id_organization_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action; END IF; END$$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'briefings_emitted_user_id_user_id_fk') THEN ALTER TABLE "briefings_emitted" ADD CONSTRAINT "briefings_emitted_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action; END IF; END$$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'briefings_emitted_tenant_id_organization_id_fk') THEN ALTER TABLE "briefings_emitted" ADD CONSTRAINT "briefings_emitted_tenant_id_organization_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action; END IF; END$$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'briefings_emitted_message_id_chat_messages_id_fk') THEN ALTER TABLE "briefings_emitted" ADD CONSTRAINT "briefings_emitted_message_id_chat_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."chat_messages"("id") ON DELETE cascade ON UPDATE no action; END IF; END$$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shared_snapshots_user_id_user_id_fk') THEN ALTER TABLE "shared_snapshots" ADD CONSTRAINT "shared_snapshots_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action; END IF; END$$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shared_snapshots_tenant_id_organization_id_fk') THEN ALTER TABLE "shared_snapshots" ADD CONSTRAINT "shared_snapshots_tenant_id_organization_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action; END IF; END$$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'push_subscriptions_user_id_user_id_fk') THEN ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action; END IF; END$$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'push_subscriptions_tenant_id_organization_id_fk') THEN ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_tenant_id_organization_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action; END IF; END$$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'memory_embeddings_user_id_user_id_fk') THEN ALTER TABLE "memory_embeddings" ADD CONSTRAINT "memory_embeddings_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action; END IF; END$$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'memory_embeddings_tenant_id_organization_id_fk') THEN ALTER TABLE "memory_embeddings" ADD CONSTRAINT "memory_embeddings_tenant_id_organization_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action; END IF; END$$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'daily_ai_spend_user_id_user_id_fk') THEN ALTER TABLE "daily_ai_spend" ADD CONSTRAINT "daily_ai_spend_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action; END IF; END$$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'daily_ai_spend_tenant_id_organization_id_fk') THEN ALTER TABLE "daily_ai_spend" ADD CONSTRAINT "daily_ai_spend_tenant_id_organization_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action; END IF; END$$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rate_limits_user_id_user_id_fk') THEN ALTER TABLE "rate_limits" ADD CONSTRAINT "rate_limits_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action; END IF; END$$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rate_limits_tenant_id_organization_id_fk') THEN ALTER TABLE "rate_limits" ADD CONSTRAINT "rate_limits_tenant_id_organization_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action; END IF; END$$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'audit_logs_user_id_user_id_fk') THEN ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action; END IF; END$$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'audit_logs_tenant_id_organization_id_fk') THEN ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_tenant_id_organization_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action; END IF; END$$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'provider_tests_user_id_user_id_fk') THEN ALTER TABLE "provider_tests" ADD CONSTRAINT "provider_tests_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action; END IF; END$$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'provider_tests_tenant_id_organization_id_fk') THEN ALTER TABLE "provider_tests" ADD CONSTRAINT "provider_tests_tenant_id_organization_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action; END IF; END$$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'diagnostic_traces_user_id_user_id_fk') THEN ALTER TABLE "diagnostic_traces" ADD CONSTRAINT "diagnostic_traces_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action; END IF; END$$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'decision_signal_feedback_signal_id_decision_signals_id_fk') THEN ALTER TABLE "decision_signal_feedback" ADD CONSTRAINT "decision_signal_feedback_signal_id_decision_signals_id_fk" FOREIGN KEY ("signal_id") REFERENCES "public"."decision_signals"("id") ON DELETE cascade ON UPDATE no action; END IF; END$$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'decision_signal_feedback_user_id_user_id_fk') THEN ALTER TABLE "decision_signal_feedback" ADD CONSTRAINT "decision_signal_feedback_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action; END IF; END$$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'decision_signal_feedback_tenant_id_organization_id_fk') THEN ALTER TABLE "decision_signal_feedback" ADD CONSTRAINT "decision_signal_feedback_tenant_id_organization_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action; END IF; END$$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'decision_signal_outcomes_signal_id_decision_signals_id_fk') THEN ALTER TABLE "decision_signal_outcomes" ADD CONSTRAINT "decision_signal_outcomes_signal_id_decision_signals_id_fk" FOREIGN KEY ("signal_id") REFERENCES "public"."decision_signals"("id") ON DELETE cascade ON UPDATE no action; END IF; END$$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'decision_signal_outcomes_tenant_id_organization_id_fk') THEN ALTER TABLE "decision_signal_outcomes" ADD CONSTRAINT "decision_signal_outcomes_tenant_id_organization_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action; END IF; END$$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'decision_signals_user_id_user_id_fk') THEN ALTER TABLE "decision_signals" ADD CONSTRAINT "decision_signals_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action; END IF; END$$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'decision_signals_thread_id_chat_threads_id_fk') THEN ALTER TABLE "decision_signals" ADD CONSTRAINT "decision_signals_thread_id_chat_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."chat_threads"("id") ON DELETE set null ON UPDATE no action; END IF; END$$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'decision_signals_tenant_id_organization_id_fk') THEN ALTER TABLE "decision_signals" ADD CONSTRAINT "decision_signals_tenant_id_organization_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action; END IF; END$$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'decision_signals_message_id_chat_messages_id_fk') THEN ALTER TABLE "decision_signals" ADD CONSTRAINT "decision_signals_message_id_chat_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."chat_messages"("id") ON DELETE set null ON UPDATE no action; END IF; END$$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'portfolio_positions_user_id_user_id_fk') THEN ALTER TABLE "portfolio_positions" ADD CONSTRAINT "portfolio_positions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action; END IF; END$$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'portfolio_positions_tenant_id_organization_id_fk') THEN ALTER TABLE "portfolio_positions" ADD CONSTRAINT "portfolio_positions_tenant_id_organization_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action; END IF; END$$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'portfolio_positions_linked_signal_id_decision_signals_id_fk') THEN ALTER TABLE "portfolio_positions" ADD CONSTRAINT "portfolio_positions_linked_signal_id_decision_signals_id_fk" FOREIGN KEY ("linked_signal_id") REFERENCES "public"."decision_signals"("id") ON DELETE set null ON UPDATE no action; END IF; END$$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'portfolio_settings_user_id_user_id_fk') THEN ALTER TABLE "portfolio_settings" ADD CONSTRAINT "portfolio_settings_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action; END IF; END$$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'portfolio_settings_tenant_id_organization_id_fk') THEN ALTER TABLE "portfolio_settings" ADD CONSTRAINT "portfolio_settings_tenant_id_organization_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action; END IF; END$$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notification_noise_state_user_id_user_id_fk') THEN ALTER TABLE "notification_noise_state" ADD CONSTRAINT "notification_noise_state_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action; END IF; END$$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notification_noise_state_tenant_id_organization_id_fk') THEN ALTER TABLE "notification_noise_state" ADD CONSTRAINT "notification_noise_state_tenant_id_organization_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action; END IF; END$$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bot_links_user_id_user_id_fk') THEN ALTER TABLE "bot_links" ADD CONSTRAINT "bot_links_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action; END IF; END$$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bot_links_tenant_id_organization_id_fk') THEN ALTER TABLE "bot_links" ADD CONSTRAINT "bot_links_tenant_id_organization_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action; END IF; END$$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payments_subscription_id_subscriptions_id_fk') THEN ALTER TABLE "payments" ADD CONSTRAINT "payments_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE set null ON UPDATE no action; END IF; END$$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payments_tenant_id_organization_id_fk') THEN ALTER TABLE "payments" ADD CONSTRAINT "payments_tenant_id_organization_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action; END IF; END$$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'subscriptions_tenant_id_organization_id_fk') THEN ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_tenant_id_organization_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action; END IF; END$$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'subscriptions_plan_id_plans_id_fk') THEN ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE restrict ON UPDATE no action; END IF; END$$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "organization_member_user_idx" ON "organization_member" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_sessions_user_id_idx" ON "user_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chat_messages_thread_idx" ON "chat_messages" USING btree ("thread_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chat_messages_tenant_id_idx" ON "chat_messages" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chat_threads_updated_at_idx" ON "chat_threads" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chat_threads_user_id_idx" ON "chat_threads" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chat_threads_tenant_id_idx" ON "chat_threads" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_opinions_thread_idx" ON "agent_opinions" USING btree ("thread_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_opinions_user_created_idx" ON "agent_opinions" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "alerts_tenant_id_idx" ON "alerts" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "alerts_user_id_idx" ON "alerts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "alerts_active_idx" ON "alerts" USING btree ("active");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "alerts_fired_at_idx" ON "alerts" USING btree ("fired_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "alerts_last_fired_at_idx" ON "alerts" USING btree ("last_fired_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "journal_entries_user_id_idx" ON "journal_entries" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "journal_entries_tenant_opened_idx" ON "journal_entries" USING btree ("tenant_id","opened_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "journal_symbol_idx" ON "journal_entries" USING btree ("symbol");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "journal_opened_idx" ON "journal_entries" USING btree ("opened_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "news_published_at_idx" ON "news_articles" USING btree ("published_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "news_source_idx" ON "news_articles" USING btree ("source");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "news_symbols_gin" ON "news_articles" USING gin ("symbols");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "news_fts_idx" ON "news_articles" USING gin (to_tsvector('english', coalesce(title, '') || ' ' || coalesce(summary, '')));--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "news_embeddings_hnsw_idx" ON "news_embeddings" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "events_date_idx" ON "economic_events" USING btree ("date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "events_importance_idx" ON "economic_events" USING btree ("importance");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "events_currency_idx" ON "economic_events" USING btree ("currency");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "snapshots_symbol_kind_asof_idx" ON "snapshots" USING btree ("symbol","kind","as_of");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chat_telemetry_tenant_id_idx" ON "chat_telemetry" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "telemetry_created_idx" ON "chat_telemetry" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "telemetry_thread_idx" ON "chat_telemetry" USING btree ("thread_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "telemetry_user_created_idx" ON "chat_telemetry" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chat_tool_telemetry_tenant_id_idx" ON "chat_tool_telemetry" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chat_tool_telemetry_user_id_idx" ON "chat_tool_telemetry" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tool_telemetry_created_idx" ON "chat_tool_telemetry" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tool_telemetry_thread_idx" ON "chat_tool_telemetry" USING btree ("thread_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tool_telemetry_tool_idx" ON "chat_tool_telemetry" USING btree ("tool");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cot_reports_symbol_date_idx" ON "cot_reports" USING btree ("symbol","report_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "shared_snapshots_user_id_idx" ON "shared_snapshots" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "shared_snapshots_expires_at_idx" ON "shared_snapshots" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "push_subscriptions_user_id_idx" ON "push_subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "memory_embeddings_tenant_id_idx" ON "memory_embeddings" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "memory_embeddings_user_id_idx" ON "memory_embeddings" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "memory_kind_idx" ON "memory_embeddings" USING btree ("kind");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "memory_source_idx" ON "memory_embeddings" USING btree ("kind","source_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "memory_symbol_idx" ON "memory_embeddings" USING btree ("symbol");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "memory_occurred_idx" ON "memory_embeddings" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "memory_embeddings_hnsw_idx" ON "memory_embeddings" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rate_limits_user_idx" ON "rate_limits" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_logs_user_id_idx" ON "audit_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_logs_action_idx" ON "audit_logs" USING btree ("action");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cron_runs_status_idx" ON "cron_runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "diagnostic_traces_user_id_idx" ON "diagnostic_traces" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "diagnostic_traces_thread_id_idx" ON "diagnostic_traces" USING btree ("thread_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "diagnostic_traces_started_at_idx" ON "diagnostic_traces" USING btree ("started_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "decision_signal_feedback_signal_user_idx" ON "decision_signal_feedback" USING btree ("signal_id","user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "decision_signal_feedback_tenant_idx" ON "decision_signal_feedback" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "decision_signal_outcomes_signal_horizon_idx" ON "decision_signal_outcomes" USING btree ("signal_id","horizon");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "decision_signal_outcomes_signal_idx" ON "decision_signal_outcomes" USING btree ("signal_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "decision_signal_outcomes_tenant_idx" ON "decision_signal_outcomes" USING btree ("tenant_id","evaluated_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "decision_signal_outcomes_evaluated_idx" ON "decision_signal_outcomes" USING btree ("evaluated_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "decision_signals_user_idx" ON "decision_signals" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "decision_signals_tenant_idx" ON "decision_signals" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "decision_signals_symbol_idx" ON "decision_signals" USING btree ("symbol","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "decision_signals_active_idx" ON "decision_signals" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "portfolio_positions_user_status_idx" ON "portfolio_positions" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "portfolio_positions_symbol_idx" ON "portfolio_positions" USING btree ("symbol","status");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "portfolio_settings_user_idx" ON "portfolio_settings" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "notification_noise_state_user_dedup_idx" ON "notification_noise_state" USING btree ("user_id","dedup_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notification_noise_state_expires_idx" ON "notification_noise_state" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bot_links_user_idx" ON "bot_links" USING btree ("user_id","platform");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ipn_events_idempotency_idx" ON "ipn_events" USING btree ("nowpayments_payment_id","payment_status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ipn_events_processed_idx" ON "ipn_events" USING btree ("processed");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payments_subscription_idx" ON "payments" USING btree ("subscription_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payments_tenant_idx" ON "payments" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payments_status_idx" ON "payments" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "plans_name_idx" ON "plans" USING btree ("name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "subscriptions_tenant_idx" ON "subscriptions" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "subscriptions_tenant_active_idx" ON "subscriptions" USING btree ("tenant_id","status");