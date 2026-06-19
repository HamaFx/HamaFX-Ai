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

import cron from 'node-cron';
import type { Logger } from './log.js';
import { JOBS } from './jobs/index.js';

export function startScheduler(log: Logger): void {
  log.info('Starting node-cron scheduler for Docker mode');

  // Alerts: Every minute
  cron.schedule('* * * * *', () => {
    void runJobSafely('alerts', log);
  });

  // Briefings: Every 5 minutes
  cron.schedule('*/5 * * * *', () => {
    void runJobSafely('briefings', log);
  });

  // Embedding backfill: Every hour at minute 0
  cron.schedule('0 * * * *', () => {
    void runJobSafely('embedding-backfill', log);
  });

  // Snapshots: Daily at 00:00 UTC
  cron.schedule('0 0 * * *', () => {
    void runJobSafely('snapshots', log);
  });

  // CoT: Weekly on Saturday at 00:00 UTC
  cron.schedule('0 0 * * 6', () => {
    void runJobSafely('cot', log);
  });

  // FRED Actuals: Daily at 01:00 UTC
  cron.schedule('0 1 * * *', () => {
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
}

async function runJobSafely(name: keyof typeof JOBS, log: Logger): Promise<void> {
  const job = JOBS[name];
  if (!job) {
    log.error(`Scheduler attempted to run unknown job: ${name}`);
    return;
  }
  
  const jobLog = log.with({ job: name });
  jobLog.info(`Running scheduled job`);
  
  try {
    const startMs = Date.now();
    const result = await job.run({ log: jobLog });
    const durationMs = Date.now() - startMs;
    
    jobLog.info(`Job completed successfully`, {
      durationMs,
      processed: result.processed,
      note: result.note,
    });
  } catch (err) {
    jobLog.error(`Job failed`, { err: String(err) });
  }
}
