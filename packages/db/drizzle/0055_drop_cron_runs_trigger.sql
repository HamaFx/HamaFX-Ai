-- Migration 0055: Drop broken tenant trigger on cron_runs (DB Audit H3)
--
-- Migration 0050 incorrectly included cron_runs in the tenant trigger
-- array. cron_runs has no user_id column, so the trigger function
-- hamafx_set_tenant_id_from_user() fails with:
--   ERROR: column "user_id" does not exist
--
-- cron_runs is a global table with tenant_id DEFAULT '__system__',
-- so no tenant trigger is needed. This migration removes the broken
-- trigger.
--
-- Idempotent — safe to re-run.

DROP TRIGGER IF EXISTS hamafx_cron_runs_tenant_id ON "cron_runs";
