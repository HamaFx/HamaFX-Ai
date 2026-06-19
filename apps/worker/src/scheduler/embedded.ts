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

import cron from 'node-cron';
import { JOBS, type JobName } from '../jobs/index.js';
import type { Logger } from '../log.js';

interface ScheduleEntry {
  name: string;
  cronExpression: string;
  run: () => Promise<void>;
}

const SCHEDULES: ScheduleEntry[] = [
  {
    name: 'briefings',
    cronExpression: '*/5 * * * *',
    run: async () => {
      await JOBS.briefings.run({
        log: console as unknown as Logger,
        signal: new AbortController().signal,
      });
    },
  },
  {
    name: 'snapshots',
    cronExpression: '5 0 * * *', // 00:05 UTC daily
    run: async () => {
      await JOBS.snapshots.run({
        log: console as unknown as Logger,
        signal: new AbortController().signal,
      });
    },
  },
  {
    name: 'resonance-sync',
    cronExpression: '0 1 * * *', // 01:00 UTC daily
    run: async () => {
      await JOBS['resonance-sync'].run({
        log: console as unknown as Logger,
        signal: new AbortController().signal,
      });
    },
  },
  {
    name: 'cot',
    cronExpression: '0 22 * * 5', // Friday 22:00 UTC
    run: async () => {
      await JOBS.cot.run({
        log: console as unknown as Logger,
        signal: new AbortController().signal,
      });
    },
  },
  {
    name: 'fred-actuals',
    cronExpression: '30 1 * * *', // 01:30 UTC daily
    run: async () => {
      await JOBS['fred-actuals'].run({
        log: console as unknown as Logger,
        signal: new AbortController().signal,
      });
    },
  },
  {
    name: 'weekly-review',
    cronExpression: '0 18 * * 0', // Sunday 18:00 UTC
    run: async () => {
      await JOBS['weekly-review'].run({
        log: console as unknown as Logger,
        signal: new AbortController().signal,
      });
    },
  },
  {
    name: 'embedding-backfill',
    cronExpression: '0 */6 * * *', // Every 6 hours
    run: async () => {
      await JOBS['embedding-backfill'].run({
        log: console as unknown as Logger,
        signal: new AbortController().signal,
      });
    },
  },
];

/**
 * Start the embedded cron scheduler. Returns a stop function.
 * Each job is wrapped in try/catch so one failure doesn't affect others.
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
    tasks.forEach((t) => t.stop());
  };
}