-- H1 (RELIABILITY_AUDIT_REPORT.md) — Shared provider health store.
-- Tracks per-provider consecutive failure state across Vercel instances.
-- The in-memory health scorer (packages/data/src/health.ts) merges this
-- with local state to compute cross-instance failover scores.

CREATE TABLE IF NOT EXISTS "provider_health" (
    "provider" text PRIMARY KEY NOT NULL,
    "last_success_at" timestamp with time zone,
    "last_failure_at" timestamp with time zone,
    "consecutive_failures" integer DEFAULT 0 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
