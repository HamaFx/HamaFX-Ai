-- Phase D2 — user-pickable vision + embedding models.
--
-- Adds two TEXT columns to user_settings so users can pick a vision
-- model (for analyze_chart_image) and an embedding model (for RAG /
-- memory / news embeddings) independently from their chat pick.
--
-- Nullable. Existing rows get NULL; the resolver falls back to the
-- provider spec defaults (vision) or env.AI_EMBEDDING_MODEL
-- (embedding, since embeddings are typically cross-provider via
-- OpenAI's embedding API).
--
-- No backfill. Phase F's 0013_chat_model.sql migration did backfill
-- from the legacy defaultModels JSONB; vision + embedding weren't in
-- that JSONB in any recoverable shape (vision was always per-tool,
-- embedding was always hardcoded).

ALTER TABLE "user_settings" ADD COLUMN "vision_model" text;--> statement-breakpoint

ALTER TABLE "user_settings" ADD COLUMN "embedding_model" text;--> statement-breakpoint

COMMENT ON COLUMN "user_settings"."vision_model" IS
  'Phase D2 — user-pickable vision model for analyze_chart_image. Shape: "<providerId>:<bareModelId>" (e.g. "google-vertex:gemini-2.5-pro"). Nullable; resolver falls back to spec.defaultModels.vision, then env.AI_VISION_MODEL, then hardcoded default.';--> statement-breakpoint

COMMENT ON COLUMN "user_settings"."embedding_model" IS
  'Phase D2 — user-pickable embedding model for RAG / memory / news embeddings. Shape: "<providerId>:<bareModelId>" (e.g. "openai:text-embedding-3-small"). Nullable; resolver falls back to env.AI_EMBEDDING_MODEL, then spec.defaultModels.embedding, then hardcoded "openai/text-embedding-3-small".';