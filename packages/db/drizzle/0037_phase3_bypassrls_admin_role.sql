-- Phase 3 §3.4 — BYPASSRLS admin role for worker/cron/migrations.
--
-- This role bypasses Row-Level Security so the worker and cron jobs can
-- operate across all tenants. It must be created by a superuser (the
-- `postgres` user on Supabase).
--
-- The worker/cron/migrations connect via ADMIN_DATABASE_URL which points
-- to this role's connection string. Application code uses getAdminDb()
-- from packages/db/src/client.ts.
--
-- Self-host (AUTH_MODE=legacy): this migration is safe to run — the role
-- is only used when ADMIN_DATABASE_URL is set. If it's not set, the
-- worker falls back to the regular DATABASE_URL connection.

-- Create the admin role. IF NOT EXISTS semantics via DO block.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'hamafx_admin') THEN
    CREATE ROLE hamafx_admin
      WITH LOGIN
      BYPASSRLS
      NOSUPERUSER
      NOCREATEDB
      NOCREATEROLE
      NOREPLICATION;
  END IF;
END
$$;

-- Grant schema + table permissions. The role needs full access to all
-- tables and sequences in the public schema.
GRANT USAGE ON SCHEMA public TO hamafx_admin;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO hamafx_admin;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO hamafx_admin;

-- Ensure future tables (created by later migrations) are also accessible.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO hamafx_admin;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO hamafx_admin;

-- Note: the password for this role must be set out-of-band by the operator:
--   ALTER ROLE hamafx_admin WITH PASSWORD '<strong-password>';
-- This is intentionally NOT in the migration to avoid committing secrets.
-- The operator sets it once, then configures ADMIN_DATABASE_URL in the
-- worker's .env file:
--   ADMIN_DATABASE_URL=postgresql://hamafx_admin:<password>@<host>:5432/postgres
