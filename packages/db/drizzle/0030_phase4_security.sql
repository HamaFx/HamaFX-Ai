-- Phase 4: Security — Encrypt telegramBotToken
--
-- SEC-3: The telegram_bot_token column in user_settings was previously
-- stored in plaintext. This migration does NOT change the column type
-- (it remains TEXT) — encryption/decryption happens in the application
-- layer via @hamafx/shared/encryption (encryptSecret/decryptSecret).
--
-- The column comment is updated to document that the value is now an
-- AES-256-GCM encrypted blob. Existing plaintext tokens must be migrated
-- by a separate application-level backfill script that reads each row,
-- encrypts the token, and writes it back. This is done in code rather
-- than SQL because the encryption key (ENCRYPTION_SECRET) is only
-- available to the Node runtime.
--
-- See: DATABASE_ARCHITECTURE_ANALYSIS_AND_PLAN.md §6 SEC-3

COMMENT ON COLUMN "user_settings"."telegram_bot_token" IS 'AES-256-GCM encrypted Telegram bot token. Format: iv_hex.ciphertext_hex.authTag_hex. Encrypted via @hamafx/shared/encryption using ENCRYPTION_SECRET. NULL if no Telegram integration configured.';