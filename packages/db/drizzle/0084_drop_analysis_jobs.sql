-- Migration 0084 — Drop analysis_jobs (Phase 3: Mastra durable runs)
--
-- The Full-mode queue moved into Mastra workflow run records
-- (`mastra_workflow_snapshot`): the web enqueues a pending `full-analysis`
-- run snapshot, the worker claims it, and web polling reads the same record.
-- The hand-rolled analysis_jobs table and its idempotency index are no longer
-- needed. DROP TABLE CASCADE also removes the tenant trigger installed by
-- 0082/0083. Idempotent and safe to re-run.

DROP TABLE IF EXISTS "analysis_jobs" CASCADE;
