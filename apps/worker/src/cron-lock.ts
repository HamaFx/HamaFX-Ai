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

// STAB-01: Cron idempotency guard.
//
// Usage:
//   const guard = await acquireCronLock('briefings', db);
//   if (!guard) return { processed: 0, note: 'skipped: already ran today' };
//   try {
//     // ... do work ...
//     await guard.done(note);
//   } catch (err) {
//     await guard.fail(err);
//     throw err;
//   }
//
// The lock is acquired by attempting to INSERT into `cron_runs`. If a row
// for (jobName, today UTC) already exists the INSERT conflicts and returns
// null, signalling the caller to skip.  This ensures at-most-once
// execution per calendar day even when systemd timers and Vercel cron fire
// concurrently.
//
// M-8: Lock TTL — if a job crashes mid-execution, the stale 'started' row
// is considered expired after LOCK_TTL_MS (default 2h). A new run can
// acquire the lock by updating the expired row instead of skipping.

import { sql } from 'drizzle-orm';
import { type getDb, schema } from '@hamafx/db';

type DbClient = ReturnType<typeof getDb>;

/** M-8: Stale locks expire after 2 hours. */
const LOCK_TTL_MS = 2 * 60 * 60 * 1000;

export interface CronLock {
  /** Mark the job as successfully completed. */
  done(note?: string): Promise<void>;
  /** Mark the job as failed with an error message. */
  fail(err: unknown): Promise<void>;
}

/**
 * Attempt to acquire an idempotency lock for `jobName` for today (UTC).
 *
 * M-8: If a previous run's lock exists but is older than LOCK_TTL_MS
 * (indicating a crashed job), the stale lock is reclaimed by updating
 * the existing row. Otherwise, a new row is inserted.
 *
 * @returns A `CronLock` on success, or `null` when the job was already
 *          recorded for today (caller should skip).
 */
export async function acquireCronLock(
  jobName: string,
  db: DbClient,
): Promise<CronLock | null> {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD UTC
  const staleThreshold = new Date(Date.now() - LOCK_TTL_MS);

  // M-8: Check for and reclaim stale locks before attempting insert.
  // A crashed job leaves status='started' with no finished_at.
  const reclaimed = await db.execute(sql`
    UPDATE cron_runs
    SET status = 'started',
        started_at = now(),
        finished_at = NULL,
        note = 'reclaimed stale lock'
    WHERE job_name = ${jobName}
      AND run_date = ${today}::date
      AND status = 'started'
      AND started_at < ${staleThreshold}
    RETURNING job_name
  `);
  if (reclaimed.length > 0) {
    return buildLock(db, jobName, today);
  }

  // Attempt an INSERT. ON CONFLICT on the (job_name, run_date) PK means
  // the row already exists — another instance is running or already ran.
  const inserted = await db.execute(sql`
    INSERT INTO cron_runs (job_name, run_date, status, started_at)
    VALUES (${jobName}, ${today}::date, 'started', now())
    ON CONFLICT (job_name, run_date) DO NOTHING
    RETURNING job_name
  `);

  // If nothing was inserted, the job already ran today.
  if (inserted.length === 0) {
    return null;
  }

  return buildLock(db, jobName, today);
}

function buildLock(db: DbClient, jobName: string, today: string): CronLock {
  return {
    async done(note?: string) {
      await db.execute(sql`
        UPDATE cron_runs
        SET status = 'done',
            finished_at = now(),
            note = ${note?.slice(0, 500) ?? null}
        WHERE job_name = ${jobName} AND run_date = ${today}::date
      `);
    },
    async fail(err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      await db.execute(sql`
        UPDATE cron_runs
        SET status = 'error',
            finished_at = now(),
            note = ${message.slice(0, 500)}
        WHERE job_name = ${jobName} AND run_date = ${today}::date
      `);
    },
  };
}

// Expose schema for convenience (re-exported from @hamafx/db).
export { schema };
