-- P1 — Billing safety gate.
-- Adds atomic checkout idempotency claims, replayable authenticated
-- NOWPayments webhook failures, and invoice-level payment idempotency.
-- Every statement is idempotent and safe to run after a partially-applied
-- billing migration.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ipn_events'
      AND column_name = 'processing'
  ) THEN
    ALTER TABLE "ipn_events"
      ADD COLUMN "processing" boolean NOT NULL DEFAULT false;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ipn_events'
      AND column_name = 'processing_at'
  ) THEN
    ALTER TABLE "ipn_events"
      ADD COLUMN "processing_at" timestamptz;
  END IF;
END $$;
--> statement-breakpoint

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'payments'
  ) THEN
    ALTER TABLE "payments"
      ADD COLUMN IF NOT EXISTS "nowpayments_payment_id" text,
      ADD COLUMN IF NOT EXISTS "nowpayments_invoice_id" text;
    ALTER TABLE "payments" ALTER COLUMN "nowpayments_payment_id" DROP NOT NULL;
  END IF;
END $$;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "billing_webhook_dlq" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "provider" text NOT NULL DEFAULT 'nowpayments',
  "event_type" text NOT NULL,
  "event_id" text NOT NULL,
  "payload" jsonb NOT NULL,
  "error" text NOT NULL,
  "received_at" timestamptz NOT NULL DEFAULT now(),
  "replayed_at" timestamptz,
  "replay_started_at" timestamptz,
  "replay_token" text,
  "status" text NOT NULL DEFAULT 'pending'
);
--> statement-breakpoint

ALTER TABLE "billing_webhook_dlq"
  ADD COLUMN IF NOT EXISTS "provider" text,
  ADD COLUMN IF NOT EXISTS "event_type" text,
  ADD COLUMN IF NOT EXISTS "event_id" text,
  ADD COLUMN IF NOT EXISTS "payload" jsonb,
  ADD COLUMN IF NOT EXISTS "error" text,
  ADD COLUMN IF NOT EXISTS "received_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "replayed_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "replay_started_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "replay_token" text,
  ADD COLUMN IF NOT EXISTS "status" text;
--> statement-breakpoint

UPDATE "billing_webhook_dlq"
SET
  "provider" = COALESCE(NULLIF("provider", ''), 'nowpayments'),
  "event_type" = COALESCE(NULLIF("event_type", ''), 'unknown'),
  "event_id" = COALESCE(NULLIF("event_id", ''), "id"),
  "payload" = COALESCE("payload", '{}'::jsonb),
  "error" = COALESCE(NULLIF("error", ''), 'unknown'),
  "received_at" = COALESCE("received_at", now()),
  "status" = COALESCE(NULLIF("status", ''), 'pending')
WHERE "provider" IS NULL
   OR "event_type" IS NULL
   OR "event_id" IS NULL
   OR "payload" IS NULL
   OR "error" IS NULL
   OR "received_at" IS NULL
   OR "status" IS NULL;
--> statement-breakpoint

ALTER TABLE "billing_webhook_dlq"
  ALTER COLUMN "provider" SET DEFAULT 'nowpayments',
  ALTER COLUMN "provider" SET NOT NULL,
  ALTER COLUMN "event_type" SET DEFAULT 'unknown',
  ALTER COLUMN "event_type" SET NOT NULL,
  ALTER COLUMN "event_id" SET DEFAULT 'unknown',
  ALTER COLUMN "event_id" SET NOT NULL,
  ALTER COLUMN "payload" SET DEFAULT '{}'::jsonb,
  ALTER COLUMN "payload" SET NOT NULL,
  ALTER COLUMN "error" SET DEFAULT 'unknown',
  ALTER COLUMN "error" SET NOT NULL,
  ALTER COLUMN "received_at" SET DEFAULT now(),
  ALTER COLUMN "received_at" SET NOT NULL,
  ALTER COLUMN "status" SET DEFAULT 'pending',
  ALTER COLUMN "status" SET NOT NULL;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "billing_webhook_dlq_status_idx"
  ON "billing_webhook_dlq" ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "billing_webhook_dlq_received_at_idx"
  ON "billing_webhook_dlq" ("received_at");
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "billing_webhook_dlq"
    GROUP BY "provider", "event_id", "event_type"
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate billing webhook DLQ event keys exist; deduplicate them before applying 0063';
  END IF;
END $$;
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "billing_webhook_dlq_event_idx"
  ON "billing_webhook_dlq" ("provider", "event_id", "event_type");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "billing_checkout_attempts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" text NOT NULL DEFAULT current_setting('app.current_tenant', true)
    REFERENCES "organization"("id") ON DELETE CASCADE,
  "idempotency_key" text NOT NULL,
  "plan_id" uuid REFERENCES "plans"("id") ON DELETE RESTRICT,
  "status" text NOT NULL DEFAULT 'pending',
  "invoice_id" text,
  "checkout_url" text,
  "error" text,
  "processing_at" timestamptz,
  "processing_token" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint

ALTER TABLE "billing_checkout_attempts"
  ADD COLUMN IF NOT EXISTS "tenant_id" text,
  ADD COLUMN IF NOT EXISTS "idempotency_key" text,
  ADD COLUMN IF NOT EXISTS "plan_id" uuid,
  ADD COLUMN IF NOT EXISTS "status" text,
  ADD COLUMN IF NOT EXISTS "invoice_id" text,
  ADD COLUMN IF NOT EXISTS "checkout_url" text,
  ADD COLUMN IF NOT EXISTS "error" text,
  ADD COLUMN IF NOT EXISTS "processing_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "processing_token" text,
  ADD COLUMN IF NOT EXISTS "created_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "updated_at" timestamptz;
--> statement-breakpoint

DO $billing_checkout_backfill$
DECLARE
  fallback_tenant text;
BEGIN
  SELECT min("id") INTO fallback_tenant FROM "organization";

  -- Existing personal tenants are user IDs. Prefer an existing user_id
  -- column if a partially-created legacy table has one; otherwise use the
  -- current tenant or the deterministic first organization for old rows.
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'billing_checkout_attempts'
      AND column_name = 'user_id'
  ) THEN
    EXECUTE $billing_checkout_update$
      UPDATE "billing_checkout_attempts"
      SET "tenant_id" = COALESCE("tenant_id", "user_id", current_setting('app.current_tenant', true), $1)
      WHERE "tenant_id" IS NULL
    $billing_checkout_update$ USING fallback_tenant;
  ELSE
    UPDATE "billing_checkout_attempts"
    SET "tenant_id" = COALESCE("tenant_id", current_setting('app.current_tenant', true), fallback_tenant)
    WHERE "tenant_id" IS NULL;
  END IF;

  UPDATE "billing_checkout_attempts"
  SET
    "idempotency_key" = COALESCE(NULLIF("idempotency_key", ''), 'legacy-' || "id"::text),
    "status" = COALESCE(NULLIF("status", ''), 'pending'),
    "created_at" = COALESCE("created_at", now()),
    "updated_at" = COALESCE("updated_at", now());

  IF EXISTS (
    SELECT 1 FROM "billing_checkout_attempts" WHERE "tenant_id" IS NULL
  ) THEN
    RAISE EXCEPTION 'billing_checkout_attempts contains rows without a resolvable tenant_id; backfill organization membership before applying 0063';
  END IF;

  -- Make legacy placeholder keys unique before creating the tenant-scoped
  -- idempotency index. Keep the first key stable and suffix later rows.
  WITH ranked AS (
    SELECT "id", "tenant_id", "idempotency_key",
      row_number() OVER (
        PARTITION BY "tenant_id", "idempotency_key"
        ORDER BY "created_at", "id"
      ) AS rn
    FROM "billing_checkout_attempts"
  )
  UPDATE "billing_checkout_attempts" a
  SET "idempotency_key" = r."idempotency_key" || '-' || a."id"::text
  FROM ranked r
  WHERE a."id" = r."id" AND r.rn > 1;
END $billing_checkout_backfill$;
--> statement-breakpoint

ALTER TABLE "billing_checkout_attempts"
  ALTER COLUMN "tenant_id" SET DEFAULT current_setting('app.current_tenant', true),
  ALTER COLUMN "tenant_id" SET NOT NULL,
  ALTER COLUMN "idempotency_key" SET DEFAULT 'legacy',
  ALTER COLUMN "idempotency_key" SET NOT NULL,
  ALTER COLUMN "status" SET DEFAULT 'pending',
  ALTER COLUMN "status" SET NOT NULL,
  ALTER COLUMN "created_at" SET DEFAULT now(),
  ALTER COLUMN "created_at" SET NOT NULL,
  ALTER COLUMN "updated_at" SET DEFAULT now(),
  ALTER COLUMN "updated_at" SET NOT NULL;
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'billing_checkout_attempts'::regclass
      AND contype = 'f'
      AND confrelid = 'organization'::regclass
      AND pg_get_constraintdef(oid) LIKE '%tenant_id%'
  ) THEN
    ALTER TABLE "billing_checkout_attempts"
      ADD CONSTRAINT "billing_checkout_attempts_tenant_id_organization_fk"
      FOREIGN KEY ("tenant_id") REFERENCES "organization"("id") ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'billing_checkout_attempts'::regclass
      AND contype = 'f'
      AND confrelid = 'plans'::regclass
      AND pg_get_constraintdef(oid) LIKE '%plan_id%'
  ) THEN
    ALTER TABLE "billing_checkout_attempts"
      ADD CONSTRAINT "billing_checkout_attempts_plan_id_plans_fk"
      FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE RESTRICT;
  END IF;
END $$;
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "billing_checkout_attempt_tenant_key_idx"
  ON "billing_checkout_attempts" ("tenant_id", "idempotency_key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "billing_checkout_attempt_status_idx"
  ON "billing_checkout_attempts" ("status");
--> statement-breakpoint

-- An invoice is the stable provider object returned before a payment ID is
-- known. Refuse to guess if a legacy database already contains duplicate
-- invoice IDs: silently choosing a row would corrupt accounting.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "payments"
    WHERE "nowpayments_invoice_id" IS NOT NULL
    GROUP BY "nowpayments_invoice_id"
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate nowpayments_invoice_id values exist in payments; deduplicate them before applying 0063';
  END IF;
END $$;
--> statement-breakpoint

-- Repair the payment-ID uniqueness expected by the Drizzle schema when a
-- partially-created legacy table is missing its original constraint. Earlier
-- migrations may already have a differently named unique index, so only add
-- this repair index when no unique index covers the column.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "payments"
    WHERE "nowpayments_payment_id" IS NOT NULL
    GROUP BY "nowpayments_payment_id"
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate nowpayments_payment_id values exist in payments; deduplicate them before applying 0063';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_index i
    JOIN pg_attribute a ON a.attrelid = i.indrelid
      AND a.attnum = ANY(i.indkey)
    WHERE i.indrelid = 'payments'::regclass
      AND i.indisunique
      AND i.indpred IS NULL
      AND i.indnatts = 1
      AND a.attname = 'nowpayments_payment_id'
  ) THEN
    CREATE UNIQUE INDEX "payments_nowpayments_payment_id_idx"
      ON "payments" ("nowpayments_payment_id");
  END IF;
END $$;
--> statement-breakpoint

-- This unique index makes local retries return the existing payment row
-- instead of creating a second accounting record.
CREATE UNIQUE INDEX IF NOT EXISTS "payments_nowpayments_invoice_id_idx"
  ON "payments" ("nowpayments_invoice_id");
