-- Migration 0054: Fix subscriptions partial unique index (DB Audit C2)
--
-- Replaces the overly restrictive UNIQUE (tenant_id, status) with a
-- partial unique index that only enforces one active/trialing
-- subscription per tenant. This allows multiple historical rows
-- (canceled, expired, past_due) for the same tenant without violating
-- the constraint.
--
-- Idempotent — safe to re-run.

-- 1. Drop the old unique index (IF EXISTS for idempotency)
DROP INDEX IF EXISTS "subscriptions_tenant_active_idx";

-- 2. Create the corrected partial unique index
--    Only one subscription per tenant can be 'active' or 'trialing' at a time.
--    Multiple canceled, expired, and past_due rows are allowed.
CREATE UNIQUE INDEX IF NOT EXISTS "subscriptions_tenant_active_idx"
  ON "subscriptions" ("tenant_id")
  WHERE "status" IN ('active', 'trialing');
