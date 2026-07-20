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
import { getDb } from '@hamafx/ai';
import { sql } from 'drizzle-orm';
import type { Logger } from './log.js';
import { JOBS } from './jobs/index.js';
import { acquireCronLock } from './cron-lock.js';
import { tenantRouter } from './tenant-router.js';

// STAB-02: Maximum wall-clock time any scheduled job may run.
// Overridable via JOB_TIMEOUT_MS env var for jobs that need more time.
const JOB_TIMEOUT_MS = Number(process.env.JOB_TIMEOUT_MS) || 120_000;

// PERF-7: In-flight guard — ensures no two invocations of the same job
// overlap. Complements the DB-level acquireCronLock for daily-cadence jobs.
const _runningJobs = new Set<keyof typeof JOBS>();
// STAB-19: Track when each running job started so we can detect stuck
// entries (e.g., a synchronous throw before the finally block, or a crash
// between _runningJobs.add() and the try block). Entries older than 2×
// JOB_TIMEOUT_MS are pruned by a periodic cleanup timer.
const _jobStartedAt = new Map<keyof typeof JOBS, number>();

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

export function startScheduler(log: Logger): () => void {
  // STAB-10: Keep references to all scheduled tasks so we can stop
  // them on shutdown. Previously these were fire-and-forget.
  const tasks: ReturnType<typeof cron.schedule>[] = [];
  let multiAgentTimer: NodeJS.Timeout | null = null;

  log.info('Starting node-cron scheduler for Docker mode');

  // WK-2: Clean up stale cron_runs rows from previous crashes before
  // the first timer fires. Rows stuck in 'started' status for > 5 min
  // are marked as 'error' so the health endpoint stops reporting them.
  void cleanupStaleCronRuns(log);

  // PF-04 — Schedule all jobs from the JOBS registry.
  // Iterates the registry and sets up cron for every entry with a
  // non-null schedule. Multi-agent-analysis uses setTimeout below.
  const jobEntries = Object.entries(JOBS) as Array<[keyof typeof JOBS, (typeof JOBS)[keyof typeof JOBS]]>;
  for (const [name, job] of jobEntries) {
    if (job.schedule === null) {
      log.info(`Job ${name} has no cron schedule — skipping cron registration`);
      continue;
    }
    tasks.push(cron.schedule(job.schedule, () => {
      void runJobSafely(name, log);
    }));
    log.info(`Scheduled job ${name} at "${job.schedule}"`);
  }

  // U2 — Multi-agent analysis: poll every 3 seconds for pending jobs.
  // PERF-7: Self-rescheduling setTimeout avoids pile-up when a poll
  // exceeds 3s. The next tick is scheduled only after the current one
  // settles (including DB transit + claim time).
  const tick = () => {
    void runJobSafely('multi-agent-analysis', log).finally(() => {
      multiAgentTimer = setTimeout(tick, 3_000);
      multiAgentTimer.unref();
    });
  };
  // Kick off the first tick at the configured interval (3s), not immediately.
  multiAgentTimer = setTimeout(tick, 3_000);
  multiAgentTimer.unref();

  // STAB-19: Periodic cleanup — scan for stuck jobs that exceed 2× the
  // timeout. If a run throws synchronously between _runningJobs.add() and
  // the try block's finally, the entry remains forever. This timer prunes
  // stale entries so the job can run again on its next schedule.
  const stuckCleanupTimer = setInterval(() => {
    const now = Date.now();
    const cutoff = 2 * JOB_TIMEOUT_MS;
    for (const [name, startedAt] of _jobStartedAt) {
      if (now - startedAt > cutoff) {
        log.warn(`Pruning stuck job from _runningJobs: ${name}`, {
          stuckForMs: now - startedAt,
        });
        _runningJobs.delete(name);
        _jobStartedAt.delete(name);
      }
    }
  }, 30_000);
  stuckCleanupTimer.unref();

  // STAB-10: Return a stop function that tears down all cron tasks,
  // the multi-agent poll timer, and the stuck-job cleanup timer.
  return () => {
    log.info('scheduler: stopping all tasks');
    clearInterval(stuckCleanupTimer);
    if (multiAgentTimer) { clearTimeout(multiAgentTimer); multiAgentTimer = null; }
    for (const t of tasks) t.stop();
  };
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
  _jobStartedAt.set(name, Date.now());

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
        _runningJobs.delete(name);
        _jobStartedAt.delete(name);
        return;
      }
    } catch (lockErr) {
      // Lock acquisition failed (DB unavailable?). Retry once before
      // proceeding without the lock — a duplicate is acceptable for
      // idempotent jobs, but a missed run is worse (STAB-07).
      jobLog.warn('Failed to acquire cron lock, retrying once', {
        err: String(lockErr),
      });
      try {
        await new Promise((r) => setTimeout(r, 500));
        lock = await acquireCronLock(name, getDb());
        if (!lock) {
          jobLog.info('Job skipped - already ran today (idempotency guard, after retry)');
          _runningJobs.delete(name);
          _jobStartedAt.delete(name);
          return;
        }
      } catch (retryErr) {
        // Both attempts failed — proceed without the lock.
        jobLog.warn('Failed to acquire cron lock after retry, proceeding without idempotency guard', {
          err: String(retryErr),
        });
      }
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
    const result = await job.run({ log: jobLog, signal: ac.signal, tenantRouter });
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
    _jobStartedAt.delete(name);
  }
}
