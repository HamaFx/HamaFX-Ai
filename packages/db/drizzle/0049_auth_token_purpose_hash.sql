-- P0-6: Add purpose discriminator to verificationToken to prevent
-- cross-flow token replay (email-verify token used for password reset
-- and vice-versa).
--
-- Also updates the primary key to include purpose so a single
-- (identifier, token) pair can coexist across purposes.

DO $$
BEGIN
  -- Add purpose column if it doesn't exist (idempotent).
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'verificationToken'
      AND column_name = 'purpose'
  ) THEN
    ALTER TABLE "verificationToken"
      ADD COLUMN "purpose" text;

    -- Backfill existing rows — without a purpose column previously,
    -- all tokens could be either type, but the only active flow that
    -- created tokens was password reset (forgotPasswordAction) and
    -- email verification (registerAction). Default to 'password_reset'
    -- for safety (a reset token is more dangerous to misclassify).
    UPDATE "verificationToken" SET "purpose" = 'password_reset';

    -- Make NOT NULL after backfill.
    ALTER TABLE "verificationToken"
      ALTER COLUMN "purpose" SET NOT NULL;
  END IF;

  -- Rebuild the primary key to include purpose.
  -- The old PK is (identifier, token). The new PK is (identifier, purpose, token).
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'verificationToken'
      AND constraint_name = 'verificationToken_identifier_token_pk'
      AND constraint_type = 'PRIMARY KEY'
  ) THEN
    ALTER TABLE "verificationToken"
      DROP CONSTRAINT "verificationToken_identifier_token_pk";

    ALTER TABLE "verificationToken"
      ADD CONSTRAINT "verificationToken_identifier_purpose_token_pk"
      PRIMARY KEY ("identifier", "purpose", "token");
  END IF;
END $$;
