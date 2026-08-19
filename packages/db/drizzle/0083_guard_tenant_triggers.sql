-- Migration 0083 — Guard tenant-id triggers by column presence
--
-- 0082 created tenant triggers for ai_shadow_comparisons, ai_regression_cases
-- and analysis_jobs. That works on databases where all three tables carry a
-- tenant_id column (production), but a fresh PGlite migration chain only
-- creates tenant_id for the first two — analysis_jobs.tenant_id exists in
-- production because of a historical schema push, not a migration — so the
-- trigger on analysis_jobs broke the migration-chain test with 42703
-- (undefined column in trigger function).
--
-- This migration makes the trigger set column-aware: create (or keep) the
-- trigger only when the table actually has tenant_id; otherwise drop it.
-- Idempotent and safe to re-run.

DO $$
DECLARE
  tbl text;
  has_col boolean;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'ai_shadow_comparisons',
    'ai_regression_cases',
    'analysis_jobs'
  ] LOOP
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = tbl
        AND column_name = 'tenant_id'
    ) INTO has_col;

    IF has_col THEN
      EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', 'hamafx_' || tbl || '_tenant_id', tbl);
      EXECUTE format(
        'CREATE TRIGGER %I BEFORE INSERT OR UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION hamafx_set_tenant_id_from_user()',
        'hamafx_' || tbl || '_tenant_id',
        tbl
      );
    ELSE
      EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', 'hamafx_' || tbl || '_tenant_id', tbl);
    END IF;
  END LOOP;
END;
$$;
