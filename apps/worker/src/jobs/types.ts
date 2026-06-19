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
  | 'weekly-review'
  | 'resonance-sync'
  | 'alerts';
