-- OBS-1: Add trace_id column to analysis_jobs for distributed tracing.
-- Allows correlating worker job logs with the originating web request.
-- Column is nullable for backward compatibility with existing rows.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'analysis_jobs'
      AND column_name = 'trace_id'
  ) THEN
    ALTER TABLE public.analysis_jobs ADD COLUMN trace_id text;
  END IF;
END $$;
