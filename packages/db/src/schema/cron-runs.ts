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

// STAB-01: Cron idempotency guard table.
//
// One row per (job_name, run_date). The composite PK prevents duplicate
// cron runs — even if two schedulers fire simultaneously (e.g. Vercel +
// systemd overlap during a deploy) the second INSERT will conflict and
// the idempotency helper will skip execution.
//
// `status` tracks lifecycle so monitoring can detect stuck jobs:
//   started  → job is running
//   done     → job completed successfully
//   error    → job threw; see `note` for last error message
//
// `note` carries the last `JobResult.note` string (≤ 500 chars) or
// the error message when status='error'.

import { pgTable, text, date, timestamp, index, primaryKey } from 'drizzle-orm/pg-core';

export const cronRuns = pgTable(
  'cron_runs',
  {
    jobName: text('job_name').notNull(),
    runDate: date('run_date').notNull(),
    status: text('status', { enum: ['started', 'done', 'error'] })
      .notNull()
      .default('started'),
    note: text('note'),
    startedAt: timestamp('started_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    finishedAt: timestamp('finished_at', { withTimezone: true, mode: 'date' }),
  },
  (t) => [
    primaryKey({ columns: [t.jobName, t.runDate], name: 'cron_runs_pkey' }),
    index('cron_runs_status_idx').on(t.status),
  ],
);
