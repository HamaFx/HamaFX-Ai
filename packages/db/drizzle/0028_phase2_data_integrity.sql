-- Phase 2: Data Integrity Constraints
--
-- Task 7:  alerts.snoozeHours CHECK (0..168)
-- Task 8:  decision_signals.confidence CHECK (0.0..1.0 or NULL)
-- Task 9:  portfolio_settings percentage fields CHECK (0..100)
-- Task 10: briefings_emitted.kind CHECK IN ('pre','post','weekly_review')
-- Task 11: journal_entries outcome/closedAt consistency CHECK
-- Task 12: portfolio_positions status/closedAt consistency CHECK
-- Task 13: cot_reports integer columns → bigint

-- Task 7: alerts.snooze_hours range check
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'alerts_snooze_hours_check'
  ) THEN
    ALTER TABLE "alerts"
      ADD CONSTRAINT "alerts_snooze_hours_check"
      CHECK ("snooze_hours" >= 0 AND "snooze_hours" <= 168);
  END IF;
END $$;
--> statement-breakpoint

-- Task 8: decision_signals.confidence range check (nullable, 0.0–1.0 when set)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'decision_signals_confidence_check'
  ) THEN
    ALTER TABLE "decision_signals"
      ADD CONSTRAINT "decision_signals_confidence_check"
      CHECK ("confidence" IS NULL OR ("confidence" >= 0.0 AND "confidence" <= 1.0));
  END IF;
END $$;
--> statement-breakpoint

-- Task 9: portfolio_settings percentage range checks
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'portfolio_settings_max_risk_pct_check'
  ) THEN
    ALTER TABLE "portfolio_settings"
      ADD CONSTRAINT "portfolio_settings_max_risk_pct_check"
      CHECK ("max_risk_per_trade_pct" >= 0 AND "max_risk_per_trade_pct" <= 100);
  END IF;
END $$;
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'portfolio_settings_max_exposure_pct_check'
  ) THEN
    ALTER TABLE "portfolio_settings"
      ADD CONSTRAINT "portfolio_settings_max_exposure_pct_check"
      CHECK ("max_total_exposure_pct" >= 0 AND "max_total_exposure_pct" <= 100);
  END IF;
END $$;
--> statement-breakpoint

-- Task 10: briefings_emitted.kind allowed values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'briefings_emitted_kind_check'
  ) THEN
    ALTER TABLE "briefings_emitted"
      ADD CONSTRAINT "briefings_emitted_kind_check"
      CHECK ("kind" IN ('pre', 'post', 'weekly_review'));
  END IF;
END $$;
--> statement-breakpoint

-- Task 11: journal_entries outcome/closedAt consistency
-- 'open' must have closedAt NULL; 'win'|'loss'|'breakeven' must have closedAt set
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'journal_outcome_closed_consistency'
  ) THEN
    ALTER TABLE "journal_entries"
      ADD CONSTRAINT "journal_outcome_closed_consistency"
      CHECK (
        ("outcome" = 'open' AND "closed_at" IS NULL) OR
        ("outcome" IN ('win', 'loss', 'breakeven') AND "closed_at" IS NOT NULL)
      );
  END IF;
END $$;
--> statement-breakpoint

-- Task 12: portfolio_positions status/closedAt consistency
-- 'open' must have closedAt NULL; 'closed' must have closedAt set
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'portfolio_status_closed_consistency'
  ) THEN
    ALTER TABLE "portfolio_positions"
      ADD CONSTRAINT "portfolio_status_closed_consistency"
      CHECK (
        ("status" = 'open' AND "closed_at" IS NULL) OR
        ("status" = 'closed' AND "closed_at" IS NOT NULL)
      );
  END IF;
END $$;
--> statement-breakpoint

-- Task 13: cot_reports integer columns → bigint
-- CFTC position counts can exceed 2.1B (integer max); bigint is required.
ALTER TABLE "cot_reports" ALTER COLUMN "dealer_long" TYPE bigint;
--> statement-breakpoint
ALTER TABLE "cot_reports" ALTER COLUMN "dealer_short" TYPE bigint;
--> statement-breakpoint
ALTER TABLE "cot_reports" ALTER COLUMN "asset_long" TYPE bigint;
--> statement-breakpoint
ALTER TABLE "cot_reports" ALTER COLUMN "asset_short" TYPE bigint;
--> statement-breakpoint
ALTER TABLE "cot_reports" ALTER COLUMN "leveraged_long" TYPE bigint;
--> statement-breakpoint
ALTER TABLE "cot_reports" ALTER COLUMN "leveraged_short" TYPE bigint;
--> statement-breakpoint
ALTER TABLE "cot_reports" ALTER COLUMN "other_long" TYPE bigint;
--> statement-breakpoint
ALTER TABLE "cot_reports" ALTER COLUMN "other_short" TYPE bigint;