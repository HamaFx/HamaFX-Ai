-- Migration 0057: Change daily_ai_spend.total_usd_cents from bigint to double precision (DB Audit M1)
--
-- The column previously used bigint (integer cents), but individual
-- telemetry rows store cost as double precision USD. Summing float
-- values into a bigint column caused truncation drift — fractional
-- cents were lost on each accumulation.
--
-- double precision preserves the full precision of the sum, and the
-- application layer already divides by 100 to get dollars.
--
-- Idempotent — safe to re-run.

ALTER TABLE "daily_ai_spend"
  ALTER COLUMN "total_usd_cents" TYPE double precision;
