// Shared types for worker jobs. Kept minimal — adding more here makes
// every job file harder to skim.

import type { Logger } from '../log.js';

export interface JobContext {
  /** Logger pre-tagged with `service: 'worker:job:<name>'`. */
  log: Logger;
  /** Aborted when systemd sends SIGTERM during a run. Jobs SHOULD honour it. */
  signal?: AbortSignal | undefined;
}

export interface JobResult {
  /** Rows / items processed (definition is per-job). */
  processed: number;
  /** Free-form note surfaced in healthchecks.io ping bodies + journald. */
  note?: string | undefined;
}

/** A registered job's run function. */
export type JobFn = (ctx: JobContext) => Promise<JobResult>;

/**
 * The full set of jobs that can be invoked from the runner CLI. New jobs
 * land here as PRs 10..14 ship.
 */
export type JobName =
  | 'embedding-backfill'
  // | 'briefings'        — PR-10
  // | 'snapshots'        — PR-11
  // | 'cot'              — PR-12
  // | 'fred-actuals'     — PR-13
  // | 'weekly-review'    — PR-14
  ;
