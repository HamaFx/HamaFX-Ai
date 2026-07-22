-- Copyright 2026 HamaFX
-- SPDX-License-Identifier: Apache-2.0

-- P2-6: 2FA backup codes and dedicated 2FA lockout columns.
ALTER TABLE "user"
  ADD COLUMN IF NOT EXISTS "two_factor_backup_codes" text[],
  ADD COLUMN IF NOT EXISTS "failed_2fa_attempts" integer DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS "two_factor_locked_until" timestamp with time zone;
