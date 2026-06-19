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

// Heavy-job runner CLI. Invoked from systemd one-shot units:
//
//   ExecStart=/usr/bin/node /opt/hamafx/app/apps/worker/dist/runner/cli.js <name>
//
// Resolves env, builds a logger pre-tagged with the job name, pings
// healthchecks.io start/success/fail, and runs the registered job
// function. Exit codes:
//   0  — success
//   1  — env / argv error (job not found, env malformed)
//   2  — job threw (already pinged fail)

import { loadEnv } from '../env.js';
import { ping, withHeartbeat } from '../healthchecks.js';
import { JOBS, type JobName } from '../jobs/index.js';
import { createLogger } from '../log.js';
import { captureException, flushSentry, initSentry } from '../sentry.js';

function isKnownJob(name: string): name is JobName {
  return name in JOBS;
}

function resolveHcUuid(env: ReturnType<typeof loadEnv>, name: JobName): string | undefined {
  // Map job name to its env var. Each job has its own UUID so we can wire
  // independent alerts in healthchecks.io.
  switch (name) {
    case 'embedding-backfill':
      return env.HC_JOB_EMBEDDING_BACKFILL_UUID;
    case 'briefings':
      return env.HC_JOB_BRIEFINGS_UUID;
    case 'snapshots':
      return env.HC_JOB_SNAPSHOTS_UUID;
    case 'cot':
      return env.HC_JOB_COT_UUID;
    case 'fred-actuals':
      return env.HC_JOB_FRED_ACTUALS_UUID;
    case 'weekly-review':
      return env.HC_JOB_WEEKLY_REVIEW_UUID;
    case 'resonance-sync':
      return env.HC_JOB_RESONANCE_SYNC_UUID;
  }
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  const jobName = argv[0];

  if (!jobName) {
    process.stderr.write(
      `usage: runner <job-name>\n  available: ${Object.keys(JOBS).join(', ')}\n`,
    );
    return 1;
  }

  if (!isKnownJob(jobName)) {
    process.stderr.write(
      `unknown job: ${jobName}\n  available: ${Object.keys(JOBS).join(', ')}\n`,
    );
    return 1;
  }

  let env: ReturnType<typeof loadEnv>;
  try {
    env = loadEnv();
  } catch (err) {
    process.stderr.write(String(err) + '\n');
    return 1;
  }

  const log = createLogger({ service: `worker:job:${jobName}`, commit: env.DEPLOYED_SHA });
  await initSentry(env, `worker:job:${jobName}`);
  const job = JOBS[jobName];
  const hcUuid = resolveHcUuid(env, jobName);

  // SIGTERM from systemd → AbortSignal so jobs can short-circuit cleanly.
  const ac = new AbortController();
  const sigtermHandler = (): void => {
    log.warn('SIGTERM received — aborting job');
    ac.abort(new Error('SIGTERM'));
  };
  process.on('SIGTERM', sigtermHandler);
  process.on('SIGINT', sigtermHandler);

  try {
    const result = await withHeartbeat(hcUuid, async () => {
      const r = await job.run({ log, signal: ac.signal });
      return r;
    });
    log.info('job completed', { processed: result.processed, note: result.note });
    return 0;
  } catch (err) {
    const stack =
      err instanceof Error && typeof err.stack === 'string' ? err.stack : String(err);
    log.error('job failed', { err: String(err), stack });
    captureException(err, { job: jobName });
    // withHeartbeat already pinged fail; ping again with the message in
    // case the wrapper didn't (defensive).
    const msg = err instanceof Error ? err.message : String(err);
    await ping(hcUuid, 'fail', msg.slice(0, 1000));
    return 2;
  } finally {
    await flushSentry(2_000);
    process.removeListener('SIGTERM', sigtermHandler);
    process.removeListener('SIGINT', sigtermHandler);
  }
}

// Entry-point detection so vitest can import without running.
const isEntryPoint = (() => {
  try {
    const moduleUrl = new URL(import.meta.url).pathname;
    const argv1 = process.argv[1];
    return Boolean(argv1) && (moduleUrl === argv1 || moduleUrl.endsWith(argv1!));
  } catch {
    return false;
  }
})();

if (isEntryPoint) {
  void main().then((code) => {
    process.exit(code);
  });
}
