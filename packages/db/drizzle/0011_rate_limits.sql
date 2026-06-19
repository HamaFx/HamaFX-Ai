-- Phase B — per-user rate limits (Postgres-backed sliding window).
--
-- Plan §4: replace in-memory IP rate limiting with a Postgres-backed
-- counter that survives distributed deployments.
--
-- Schema: one row per (user_id, endpoint_group, 1-minute window).
-- The minute-aligned window_start PK auto-rolls over without a sweeper.
--
-- Use the rate_limits table from the @hamafx/db schema:
--   rateLimits.userId, rateLimits.endpointGroup, rateLimits.windowStart, rateLimits.requestCount
-- and a composite PK on (user_id, endpoint_group, window_start).
-- A separate (user_id) index supports lookup-by-user queries.

CREATE TABLE "rate_limits" (
  "user_id" text NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  "endpoint_group" text NOT NULL,
  "window_start" timestamp with time zone NOT NULL,
  "request_count" integer DEFAULT 0 NOT NULL,
  CONSTRAINT "rate_limits_pk" PRIMARY KEY ("user_id", "endpoint_group", "window_start")
);
--> statement-breakpoint
CREATE INDEX "rate_limits_user_idx" ON "rate_limits" ("user_id");