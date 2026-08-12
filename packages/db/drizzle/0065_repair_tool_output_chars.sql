-- Migration 0065: repair output_chars on chat_tool_telemetry
-- F7-obs: per-tool output size tracking for cost/observability.
-- Idempotent: safe to re-apply.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'chat_tool_telemetry'
      AND column_name = 'output_chars'
  ) THEN
    ALTER TABLE "public"."chat_tool_telemetry"
      ADD COLUMN "output_chars" INTEGER;
  END IF;
END $$;
