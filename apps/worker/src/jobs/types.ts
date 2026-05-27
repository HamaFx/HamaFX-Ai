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
 * The full set of jobs that can be invoked from the runner CLI.
 */
export type JobName =
  | 'embedding-backfill'
  | 'briefings'
  | 'snapshots'
  | 'cot'
  | 'fred-actuals'
  | 'weekly-review';
