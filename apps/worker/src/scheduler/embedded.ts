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

// Embedded scheduler — runs cron jobs in-process via node-cron.
// Used in local development mode. Production uses systemd timers on GCE VM.
//
// Heavy jobs use the existing JOBS registry. Light crons (news, alerts,
// warm-cache) that normally hit Vercel endpoints are skipped in embedded
// mode — they require API keys that most local dev users won't have.
//
// J-4: Each job entry stores its AbortController so a pending run can be
// aborted on shutdown or when a new tick fires before the previous run
// finished. Previously, controllers were created and immediately discarded,
// making them uncancelable.

import cron from 'node-cron';
import { JOBS } from '../jobs/index.js';
import type { Logger } from '../log.js';
import { createLogger } from '../log.js';

/** Raw job definition — what we write in the registry. */
interface ScheduleDef {
  name: string;
  cronExpression: string;
  _rawRun: (signal: AbortSignal) => Promise<void>;
}

/** Full job entry — with `run` wrapper + abort controller tracking. */
interface ScheduleEntry extends ScheduleDef {
  run: () => Promise<void>;
  controller?: AbortController;
}

const RAW: ScheduleDef[] = [
  {
    name: 'briefings',
    cronExpression: '*/5 * * * *',
    async _rawRun(signal: AbortSignal) {
      const log = createLogger({ service: 'worker:job:briefings' });
      await JOBS.briefings.run({
        log,
        signal,
      });
    },
  },
  {
    name: 'snapshots',
    cronExpression: '5 0 * * *', // 00:05 UTC daily
    async _rawRun(signal: AbortSignal) {
      const log = createLogger({ service: 'worker:job:snapshots' });
      await JOBS.snapshots.run({
        log,
        signal,
      });
    },
  },
  {
    name: 'resonance-sync',
    cronExpression: '0 23 * * *', // 23:00 UTC daily (matches main scheduler)
    async _rawRun(signal: AbortSignal) {
      const log = createLogger({ service: 'worker:job:resonance-sync' });
      await JOBS['resonance-sync'].run({
        log,
        signal,
      });
    },
  },
  {
    name: 'cot',
    cronExpression: '0 22 * * 5', // Friday 22:00 UTC
    async _rawRun(signal: AbortSignal) {
      const log = createLogger({ service: 'worker:job:cot' });
      await JOBS.cot.run({
        log,
        signal,
      });
    },
  },
  {
    name: 'fred-actuals',
    cronExpression: '30 1 * * *', // 01:30 UTC daily
    async _rawRun(signal: AbortSignal) {
      const log = createLogger({ service: 'worker:job:fred-actuals' });
      await JOBS['fred-actuals'].run({
        log,
        signal,
      });
    },
  },
  {
    name: 'weekly-review',
    cronExpression: '0 18 * * 0', // Sunday 18:00 UTC
    async _rawRun(signal: AbortSignal) {
      const log = createLogger({ service: 'worker:job:weekly-review' });
      await JOBS['weekly-review'].run({
        log,
        signal,
      });
    },
  },
  {
    name: 'embedding-backfill',
    cronExpression: '0 */6 * * *', // Every 6 hours
    async _rawRun(signal: AbortSignal) {
      const log = createLogger({ service: 'worker:job:embedding-backfill' });
      await JOBS['embedding-backfill'].run({
        log,
        signal,
      });
    },
  },
  {
    name: 'alerts',
    cronExpression: '* * * * *', // Every minute
    async _rawRun(signal: AbortSignal) {
      const log = createLogger({ service: 'worker:job:alerts' });
      await JOBS.alerts.run({
        log,
        signal,
      });
    },
  },
  {
    name: 'retention',
    cronExpression: '15 3 * * *', // 03:15 UTC daily
    async _rawRun(signal: AbortSignal) {
      const log = createLogger({ service: 'worker:job:retention' });
      await JOBS.retention.run({
        log,
        signal,
      });
    },
  },
  {
    name: 'multi-agent-analysis',
    cronExpression: '* * * * *', // Every minute (but job is idempotent via claim pattern)
    async _rawRun(signal: AbortSignal) {
      const log = createLogger({ service: 'worker:job:multi-agent-analysis' });
      await JOBS['multi-agent-analysis'].run({
        log,
        signal,
      });
    },
  },
];

/** Transform raw definitions into full entries with abort-controller tracking. */
function buildEntry(def: ScheduleDef): ScheduleEntry {
  // `run: undefined!` is immediately overwritten below — it exists only to
  // satisfy the required property in the ScheduleEntry interface.
  const entry: ScheduleEntry = { ...def, run: undefined! };
  entry.run = async () => {
    // Best-effort cancellation of any previous run still in flight.
    // The old job receives an abort signal but may not stop immediately;
    // brief overlap is acceptable in dev mode.
    entry.controller?.abort();
    entry.controller = new AbortController();
    await entry._rawRun(entry.controller.signal);
  };
  return entry;
}

const SCHEDULES: ScheduleEntry[] = RAW.map(buildEntry);

/**
 * Start the embedded cron scheduler. Returns a stop function.
 *
 * Each job stores its AbortController so a pending run can be aborted
 * on shutdown or when a new tick fires before the previous run finished.
 * Jobs that fail due to missing API keys log a warning and continue.
 */
export function startEmbeddedScheduler(log: Logger): () => void {
  const tasks = SCHEDULES.map((entry) => {
    const task = cron.schedule(entry.cronExpression, async () => {
      log.info(`scheduler: running ${entry.name}`);
      try {
        await entry.run();
        log.info(`scheduler: ${entry.name} completed`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log.warn(`scheduler: ${entry.name} failed — ${msg}`);
      }
    });
    log.info(`scheduler: registered ${entry.name} (${entry.cronExpression})`);
    return task;
  });

  return () => {
    log.info('scheduler: stopping all tasks');
    // Abort any currently-running jobs before stopping the cron tasks.
    for (const entry of SCHEDULES) {
      entry.controller?.abort();
    }
    tasks.forEach((t) => t.stop());
  };
}
