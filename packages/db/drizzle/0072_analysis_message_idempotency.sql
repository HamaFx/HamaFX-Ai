-- Phase 8: durable idempotency for retried multi-agent analysis.
-- Existing duplicate opinions are collapsed before the unique index is added.

ALTER TABLE "chat_messages"
  ADD COLUMN IF NOT EXISTS "idempotency_key" text;
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "chat_messages_idempotency_key_uk"
  ON "chat_messages" ("idempotency_key")
  WHERE "idempotency_key" IS NOT NULL;
--> statement-breakpoint

DELETE FROM "agent_opinions" AS duplicate
USING "agent_opinions" AS original
WHERE duplicate."message_id" = original."message_id"
  AND duplicate."agent_name" = original."agent_name"
  AND duplicate."id" > original."id";
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "agent_opinions_message_agent_uk"
  ON "agent_opinions" ("message_id", "agent_name");
