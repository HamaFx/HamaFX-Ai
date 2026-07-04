-- 0040: Phase B — Billing schema (NOWPayments / crypto)
--
-- Creates four tables for the billing integration:
--   plans           — product tiers (Free, Pro, Enterprise)
--   subscriptions   — per-tenant subscription state
--   payments        — one row per IPN-confirmed payment
--   ipn_events      — idempotency + audit log for NOWPayments webhooks
--
-- See docs/review/10-billing-nowpayments-integration-plan.md for the full
-- integration design and acceptance criteria.

-- ── Enums ─────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE plan_interval AS ENUM ('monthly', 'quarterly', 'yearly');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

DO $$ BEGIN
  CREATE TYPE subscription_status AS ENUM ('trialing', 'active', 'past_due', 'canceled', 'expired');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

DO $$ BEGIN
  CREATE TYPE payment_status AS ENUM ('waiting', 'confirming', 'confirmed', 'sending', 'finished', 'failed', 'expired', 'refunded');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

-- ── Plans ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "plans" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" text NOT NULL,
  "nowpayments_plan_id" text,
  "price_usd_cents" integer NOT NULL DEFAULT 0,
  "pay_currency" text DEFAULT 'usdt',
  "interval" plan_interval NOT NULL DEFAULT 'monthly',
  "features" jsonb DEFAULT '[]'::jsonb,
  "monthly_token_cap" integer,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "plans_name_idx" ON "plans" ("name");
--> statement-breakpoint

-- ── Subscriptions ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "subscriptions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" text NOT NULL DEFAULT current_setting('app.current_tenant', true)
    REFERENCES "organization"("id") ON DELETE CASCADE,
  "plan_id" uuid NOT NULL
    REFERENCES "plans"("id") ON DELETE RESTRICT,
  "status" subscription_status NOT NULL DEFAULT 'active',
  "nowpayments_recurring_id" text,
  "nowpayments_invoice_id" text,
  "current_period_end" timestamptz,
  "trial_end" timestamptz,
  "canceled_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "subscriptions_tenant_idx" ON "subscriptions" ("tenant_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "subscriptions_tenant_active_idx" ON "subscriptions" ("tenant_id", "status");
--> statement-breakpoint

-- ── Payments ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "payments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "subscription_id" uuid REFERENCES "subscriptions"("id") ON DELETE SET NULL,
  "tenant_id" text NOT NULL DEFAULT current_setting('app.current_tenant', true)
    REFERENCES "organization"("id") ON DELETE CASCADE,
  "nowpayments_payment_id" text NOT NULL UNIQUE,
  "nowpayments_invoice_id" text,
  "status" payment_status NOT NULL DEFAULT 'waiting',
  "pay_amount" text,
  "pay_currency" text,
  "usd_amount_cents" integer,
  "tx_hash" text,
  "ipn_payload" jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "payments_subscription_idx" ON "payments" ("subscription_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payments_tenant_idx" ON "payments" ("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payments_status_idx" ON "payments" ("status");
--> statement-breakpoint

-- ── IPN Events (idempotency + audit) ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS "ipn_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "nowpayments_payment_id" text NOT NULL,
  "payment_status" text NOT NULL,
  "body_hash" text NOT NULL,
  "raw_body" jsonb NOT NULL,
  "processed" boolean NOT NULL DEFAULT false,
  "error" text,
  "received_at" timestamptz NOT NULL DEFAULT now(),
  "processed_at" timestamptz
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "ipn_events_idempotency_idx" ON "ipn_events" ("nowpayments_payment_id", "payment_status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ipn_events_processed_idx" ON "ipn_events" ("processed");
--> statement-breakpoint

-- ── Updated-at triggers ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.updated_at IS NULL OR NEW.updated_at = OLD.updated_at THEN
    NEW.updated_at = now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

DROP TRIGGER IF EXISTS trg_updated_at_plans ON "plans";
--> statement-breakpoint
CREATE TRIGGER trg_updated_at_plans
  BEFORE UPDATE ON "plans"
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
--> statement-breakpoint

DROP TRIGGER IF EXISTS trg_updated_at_subscriptions ON "subscriptions";
--> statement-breakpoint
CREATE TRIGGER trg_updated_at_subscriptions
  BEFORE UPDATE ON "subscriptions"
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
--> statement-breakpoint

DROP TRIGGER IF EXISTS trg_updated_at_payments ON "payments";
--> statement-breakpoint
CREATE TRIGGER trg_updated_at_payments
  BEFORE UPDATE ON "payments"
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
--> statement-breakpoint


