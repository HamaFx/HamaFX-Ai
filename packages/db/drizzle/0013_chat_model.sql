ALTER TABLE "user_settings" ADD COLUMN "chat_model" text;--> statement-breakpoint

-- Backfill chat_model from the pre-F `default_models` JSONB column.
-- Priority: technical → fundamental → summary. We never carry
-- vision/embedding forward because those have genuinely different
-- semantics (vision = needs vision-capable model; embedding = needs
-- embedding-only model) and should not be the same as the chat pick.
--
-- Only rows that have a non-null default_models get a backfilled
-- value; rows with default_models = '{}' or NULL stay NULL and the
-- resolver falls back to the provider spec defaults.
UPDATE "user_settings"
SET "chat_model" = COALESCE(
  NULLIF("default_models"->>'technical', ''),
  NULLIF("default_models"->>'fundamental', ''),
  NULLIF("default_models"->>'summary', '')
)
WHERE "default_models" IS NOT NULL
  AND jsonb_typeof("default_models") = 'object'
  AND (
    "default_models" ? 'technical'
    OR "default_models" ? 'fundamental'
    OR "default_models" ? 'summary'
  );--> statement-breakpoint

COMMENT ON COLUMN "user_settings"."chat_model" IS
  'Phase F — single "default chat model" picker. Shape: "<providerId>:<bareModelId>" (e.g. "google-vertex:gemini-2.5-pro"). Nullable; when null the resolver falls back to the provider spec defaults.';
