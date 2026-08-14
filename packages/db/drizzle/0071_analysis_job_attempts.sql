-- Phase 3: bounded retries for background multi-agent analysis jobs.
-- Existing rows start at zero; workers increment the counter atomically when
-- claiming a job and use it to bound transient/stale-lease retries.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'analysis_jobs'
      AND column_name = 'attempt_count'
  ) THEN
    ALTER TABLE public.analysis_jobs
      ADD COLUMN attempt_count integer NOT NULL DEFAULT 0;
  END IF;
END $$;
