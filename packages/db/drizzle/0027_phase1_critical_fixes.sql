-- Phase 1 Critical Fixes: provider_tests PK + rate_limits FK
--
-- Task 3: Convert provider_tests composite index to a primary key.
--   The schema was using index() instead of primaryKey(), meaning the
--   upsert ON CONFLICT clause had no unique constraint to match against.
--
-- Task 4: Re-add foreign key on rate_limits.user_id → user.id.
--   The FK was dropped during Phase B multi-user migration and never
--   restored, leaving orphaned rate-limit rows when users are deleted.

-- Task 3: provider_tests — replace index with composite primary key
DROP INDEX IF EXISTS "provider_tests_user_provider_idx";
--> statement-breakpoint
ALTER TABLE "provider_tests" ADD CONSTRAINT "provider_tests_user_id_provider_id_pk" PRIMARY KEY ("user_id", "provider_id");
--> statement-breakpoint

-- Task 4: rate_limits — add FK on user_id → user.id with ON DELETE CASCADE
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'rate_limits_user_id_user_id_fk'
      AND conrelid = '"rate_limits"'::regclass
  ) THEN
    ALTER TABLE "rate_limits"
      ADD CONSTRAINT "rate_limits_user_id_user_id_fk"
      FOREIGN KEY ("user_id") REFERENCES "public"."user"("id")
      ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;