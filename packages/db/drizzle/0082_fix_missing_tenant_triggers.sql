-- Migration 0082 — Fix missing tenant-id triggers
--
-- Three user-scoped tables created after migration 0050 never received the
-- tenant-id trigger, so every INSERT that omits tenant_id fails with a
-- NOT-NULL violation whenever the session setting app.current_tenant is not
-- set (e.g. direct inserts from the shadow-comparison service, the
-- feedback→regression flow, and worker analysis jobs). In production this
-- meant Admin → AI Compare never persisted rows — every comparison insert
-- was caught and swallowed by persistComparisonSafely().
--
-- Idempotent: DROP IF EXISTS + CREATE per table, safe to re-run.

DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'ai_shadow_comparisons',
    'ai_regression_cases',
    'analysis_jobs'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', 'hamafx_' || tbl || '_tenant_id', tbl);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE INSERT OR UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION hamafx_set_tenant_id_from_user()',
      'hamafx_' || tbl || '_tenant_id',
      tbl
    );
  END LOOP;
END;
$$;
