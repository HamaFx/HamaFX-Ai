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

// STAB-01 + STAB-02: Scheduler with idempotency guards and per-job timeouts.
//
// Jobs whose cadence is >= daily use once-per-day idempotency via
// acquireCronLock (STAB-01). Minute-level jobs (alerts, briefings) are
// inherently idempotent and skip the lock.
//
// STAB-02: Every job run races against a 60-second AbortController. The
// signal is threaded into JobContext so individual jobs can short-circuit
// long loops.

import cron from 'node-cron';
import { getDb } from '@hamafx/db';
import { sql } from 'drizzle-orm';
import type { Logger } from './log.js';
import { JOBS } from './jobs/index.js';
import { acquireCronLock } from './cron-lock.js';

// STAB-02: Maximum wall-clock time any scheduled job may run.
// Overridable via JOB_TIMEOUT_MS env var for jobs that need more time.
const JOB_TIMEOUT_MS = Number(process.env.JOB_TIMEOUT_MS) || 120_000;

// PERF-7: In-flight guard — ensures no two invocations of the same job
// overlap. Complements the DB-level acquireCronLock for daily-cadence jobs.
const _runningJobs = new Set<keyof typeof JOBS>();

// Jobs that run more often than once-per-day are inherently idempotent
// at the application layer (briefings uses (eventId, kind) PK; alerts
// evaluates current state each minute). Skip the daily lock for them.
//
// embedding-backfill is also excluded: it fires every 6 hours but the
// daily acquireCronLock meant a failed 00:00 run blocked all 3 same-day
// retries. The job is already idempotent per-article (query filters for
// `embedding IS NULL`), so removing the daily lock lets each 6-hour
// timer firing run independently and self-heal within the same day.
// (Phase 6 task 6.2 - 05 section 3 job 1)
const SKIP_DAILY_LOCK = new Set<keyof typeof JOBS>([
  'alerts',
  'briefings',
  'embedding-backfill',
  'multi-agent-analysis',
]);

export function startScheduler(log: Logger): void {
  log.info('Starting node-cron scheduler for Docker mode');

  // WK-2: Clean up stale cron_runs rows from previous crashes before
  // the first timer fires. Rows stuck in 'started' status for > 5 min
  // are marked as 'error' so the health endpoint stops reporting them.
  void cleanupStaleCronRuns(log);

  // Alerts: Every minute
  cron.schedule('* * * * *', () => {
    void runJobSafely('alerts', log);
  });

  // Briefings: Every 5 minutes
  cron.schedule('*/5 * * * *', () => {
    void runJobSafely('briefings', log);
  });

  // Embedding backfill: Every 6 hours (aligned with systemd timer)
  cron.schedule('0 */6 * * *', () => {
    void runJobSafely('embedding-backfill', log);
  });

  // Snapshots: Daily at 00:05 UTC (aligned with systemd timer)
  cron.schedule('5 0 * * *', () => {
    void runJobSafely('snapshots', log);
  });

  // CoT: Weekly on Friday at 22:00 UTC (aligned with systemd timer)
  cron.schedule('0 22 * * 5', () => {
    void runJobSafely('cot', log);
  });

  // FRED Actuals: Daily at 01:30 UTC (aligned with systemd timer)
  cron.schedule('30 1 * * *', () => {
    void runJobSafely('fred-actuals', log);
  });

  // Resonance Sync: Daily at 23:00 UTC
  cron.schedule('0 23 * * *', () => {
    void runJobSafely('resonance-sync', log);
  });

  // Weekly Review: Sunday at 18:00 UTC
  cron.schedule('0 18 * * 0', () => {
    void runJobSafely('weekly-review', log);
  });

  // DB-1 — Retention cleanup: Daily at 03:15 UTC
  cron.schedule('15 3 * * *', () => {
    void runJobSafely('retention', log);
  });

  // U2 — Multi-agent analysis: poll every 3 seconds for pending jobs.
  // PERF-7: Self-rescheduling setTimeout avoids pile-up when a poll
  // exceeds 3s. The next tick is scheduled only after the current one
  // settles (including DB transit + claim time).
  const tick = () => {
    void runJobSafely('multi-agent-analysis', log).finally(() => {
      const next = setTimeout(tick, 3_000);
      next.unref();
    });
  };
  // Kick off the first tick at the configured interval (3s), not immediately.
  const first = setTimeout(tick, 3_000);
  first.unref();
}

/**
 * WK-2: Mark stale cron_runs rows as 'error' on startup.
 *
 * After a crash or forced restart, rows left in 'started' status are
 * cleaned up so the health endpoint (/api/health) stops reporting them
 * as stuck and the idempotency lock releases for the next scheduled run.
 * Rows older than 5 minutes are considered stale.
 */
async function cleanupStaleCronRuns(log: Logger): Promise<void> {
  try {
    const db = getDb();
    const result = await db.execute(sql`
      UPDATE cron_runs
      SET status = 'error',
          finished_at = now(),
          note = COALESCE(note, 'marked stale on scheduler startup')
      WHERE status = 'started'
        AND started_at < now() - INTERVAL '5 minutes'
    `);

    // In drizzle-orm, execute() returns RowList which may have .length
    // as an array-like property. Cast to access count of affected rows.
    const count = Array.isArray(result) ? result.length : (result as { length?: number }).length ?? 0;
    if (count > 0) {
      log.warn(`Cleaned up ${count} stale cron_runs row(s) from previous run`);
    }
  } catch (err) {
    log.warn('Failed to clean up stale cron_runs rows (non-fatal)', { err: String(err) });
  }
}

async function runJobSafely(name: keyof typeof JOBS, log: Logger): Promise<void> {
  const job = JOBS[name];
  if (!job) {
    log.error(`Scheduler attempted to run unknown job: ${name}`);
    return;
  }

  // PERF-7: Guard against overlapping runs of the same job.
  if (_runningJobs.has(name)) {
    log.info(`Job ${name} skipped — previous run still in flight`);
    return;
  }
  _runningJobs.add(name);

  // OBS-02: Per-run correlation ID so all log lines from one execution can
  // be filtered together in Loki / CloudWatch / journald.
  const runId = crypto.randomUUID();
  const jobLog = log.with({ job: name, runId });

  // STAB-01: Acquire an idempotency lock for daily-cadence jobs.
  const useLock = !SKIP_DAILY_LOCK.has(name);
  let lock = null;
  if (useLock) {
    try {
      lock = await acquireCronLock(name, getDb());
      if (!lock) {
        jobLog.info('Job skipped - already ran today (idempotency guard)');
        return;
      }
    } catch (lockErr) {
      // Lock acquisition failed (DB unavailable?). Log and proceed without
      // idempotency rather than silently skipping - a missed run is worse
      // than a duplicate for most jobs.
      jobLog.warn('Failed to acquire cron lock, proceeding without idempotency guard', {
        err: String(lockErr),
      });
    }
  }

  // STAB-02: Race the job against a hard timeout.
  const ac = new AbortController();
  const timeoutHandle = setTimeout(() => {
    ac.abort(new Error(`Job ${name} timed out after ${JOB_TIMEOUT_MS}ms`));
  }, JOB_TIMEOUT_MS);

  jobLog.info('Running scheduled job');

  try {
    const startMs = Date.now();
    const result = await job.run({ log: jobLog, signal: ac.signal });
    const durationMs = Date.now() - startMs;

    jobLog.info('Job completed successfully', {
      durationMs,
      processed: result.processed,
      note: result.note,
    });

    await lock?.done(result.note);
  } catch (err) {
    const isTimeout = ac.signal.aborted;
    jobLog.error(`Job ${isTimeout ? 'timed out' : 'failed'}`, { err: String(err) });
    await lock?.fail(err);
  } finally {
    clearTimeout(timeoutHandle);
    _runningJobs.delete(name);
  }
}
