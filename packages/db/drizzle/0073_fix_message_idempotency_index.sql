-- Phase 8 follow-up: PostgreSQL cannot infer a partial unique index from
-- ON CONFLICT (idempotency_key) without repeating its predicate.

DROP INDEX IF EXISTS "chat_messages_idempotency_key_uk";
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "chat_messages_idempotency_key_uk"
  ON "chat_messages" ("idempotency_key");
