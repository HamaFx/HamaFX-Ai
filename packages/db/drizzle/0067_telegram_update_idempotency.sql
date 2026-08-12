-- Migration 0067: persistent Telegram update idempotency
--
-- The runtime has an in-memory fallback, but the schema already defines
-- telegram_updates for multi-instance webhook deduplication. Keep the
-- database shape aligned with that schema and make the operation idempotent.

CREATE TABLE IF NOT EXISTS "telegram_updates" (
  "update_id" bigint PRIMARY KEY,
  "processed_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "telegram_updates_processed_at_idx"
  ON "telegram_updates" ("processed_at");
