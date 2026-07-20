/**
 * Copyright 2026 HamaFX
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// Shared types for worker jobs. Kept minimal — adding more here makes
// every job file harder to skim.

import type { Logger } from '../log.js';

// -----------------------------------------------------------------------
// PF-09 — ISP-compliant job context split.
//
// `JobCoreContext` contains the fields every job needs (log).
// `JobCancellableContext` extends it with an abort signal for jobs
// that support cancellation. The `JobFn` type accepts the cancellable
// variant because all current jobs support signals (via the scheduler's
// AbortController or the runner CLI's SIGTERM handler).
// -----------------------------------------------------------------------

export interface JobCoreContext {
  /** Logger pre-tagged with `service: 'worker:job:<name>'`. */
  log: Logger;
  /**
   * PF-23 — Tenant router for partitioned worker deployments.
   * Determines whether this worker instance owns a given tenant.
   * Always returns true in single-worker mode.
   */
  tenantRouter: import('../tenant-router.js').TenantRouter;
}

export interface JobCancellableContext extends JobCoreContext {
  /** Aborted when systemd sends SIGTERM during a run. Jobs SHOULD honour it. */
  signal: AbortSignal;
}

/**
 * Backward-compatible alias — use `JobCoreContext` or `JobCancellableContext`
 * directly for new code.
 * @deprecated Prefer `JobCoreContext` or `JobCancellableContext`.
 */
export type JobContext = JobCancellableContext;

export interface JobResult {
  /** Rows / items processed (definition is per-job). */
  processed: number;
  /** Free-form note surfaced in healthchecks.io ping bodies + journald. */
  note?: string | undefined;
}

/** A registered job's run function. Accepts the cancellable variant. */
export type JobFn = (ctx: JobCancellableContext) => Promise<JobResult>;

/**
 * The full set of jobs that can be invoked from the runner CLI.
 */
export type JobName =
  | 'embedding-backfill'
  | 'briefings'
  | 'snapshots'
  | 'cot'
  | 'fred-actuals'
  | 'weekly-review'
  | 'resonance-sync'
  | 'alerts'
  | 'multi-agent-analysis'
  | 'retention';

/**
 * PF-04 — Registered job with schedule and healthchecks.io metadata.
 *
 * Each job has:
 *   - `name`: unique identifier matching the JobName type.
 *   - `description`: one-line explanation for healthchecks.io ping bodies.
 *   - `run`: the async function that executes the job.
 *   - `schedule`: optional cron expression. `null` means the job is not
 *     scheduled on a timer (e.g., multi-agent-analysis uses setTimeout).
 *   - `hcUuidEnvVar`: optional key in the WorkerEnv that holds the
 *     healthchecks.io UUID for this job's heartbeats.
 */
export interface JobRegistration {
  name: JobName;
  description: string;
  run: JobFn;
  /** Cron expression for node-cron scheduling. `null` = no cron schedule. */
  schedule: string | null;
  /**
   * Env var key on the WorkerEnv that holds the healthchecks.io UUID
   * for this job. When set, the runner CLI reads `env[hcUuidEnvVar]`
   * instead of using a switch statement.
   */
  hcUuidEnvVar?: keyof import('../env.js').WorkerEnv | undefined;
}
