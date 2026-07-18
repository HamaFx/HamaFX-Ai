-- Migration 0056: Add composite index on audit_logs (DB Audit H6)
--
-- audit_logs was missing a composite index on (tenant_id, created_at).
-- RLS scoping filters by tenant_id, and admin queries filter by date
-- range. Without this index, tenant-scoped audit queries would
-- sequential-scan the table.
--
-- Idempotent — safe to re-run.

CREATE INDEX IF NOT EXISTS "audit_logs_tenant_created_idx"
  ON "audit_logs" ("tenant_id", "created_at");
