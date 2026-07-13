-- 0044: Add tenant_id to 10 global/shared tables.
-- These columns already exist in prod but were missing from the Drizzle schema.
-- Idempotent: all ADD COLUMN IF NOT EXISTS so safe to re-run.
ALTER TABLE "candles_1m" ADD COLUMN IF NOT EXISTS "tenant_id" text DEFAULT '__system__';
ALTER TABLE "cot_reports" ADD COLUMN IF NOT EXISTS "tenant_id" text DEFAULT '__system__';
ALTER TABLE "cron_runs" ADD COLUMN IF NOT EXISTS "tenant_id" text DEFAULT '__system__';
ALTER TABLE "economic_events" ADD COLUMN IF NOT EXISTS "tenant_id" text DEFAULT '__system__';
ALTER TABLE "intermarket_resonance" ADD COLUMN IF NOT EXISTS "tenant_id" text DEFAULT '__system__';
ALTER TABLE "live_ticks" ADD COLUMN IF NOT EXISTS "tenant_id" text DEFAULT '__system__';
ALTER TABLE "news_articles" ADD COLUMN IF NOT EXISTS "tenant_id" text DEFAULT '__system__';
ALTER TABLE "news_embeddings" ADD COLUMN IF NOT EXISTS "tenant_id" text DEFAULT '__system__';
ALTER TABLE "snapshots" ADD COLUMN IF NOT EXISTS "tenant_id" text DEFAULT '__system__';
ALTER TABLE "symbol_catalog" ADD COLUMN IF NOT EXISTS "tenant_id" text DEFAULT '__system__';
