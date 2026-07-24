-- S-2 — Admin audit log for privileged admin actions.
-- This table is separate from the tenant-scoped `audit_logs` table.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'admin_audit_log'
  ) THEN
    CREATE TABLE "admin_audit_log" (
      "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
      "actor_user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
      "action" text NOT NULL,
      "target_user_id" text REFERENCES "user"("id") ON DELETE CASCADE,
      "metadata" jsonb,
      "created_at" timestamp with time zone DEFAULT now() NOT NULL
    );
  END IF;
END
$$;

-- Indexes for common audit query patterns.
CREATE INDEX IF NOT EXISTS "admin_audit_log_actor_user_id_idx" ON "admin_audit_log" ("actor_user_id");
CREATE INDEX IF NOT EXISTS "admin_audit_log_target_user_id_idx" ON "admin_audit_log" ("target_user_id");
CREATE INDEX IF NOT EXISTS "admin_audit_log_action_idx" ON "admin_audit_log" ("action");
CREATE INDEX IF NOT EXISTS "admin_audit_log_created_at_idx" ON "admin_audit_log" ("created_at" DESC);
