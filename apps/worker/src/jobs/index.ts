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

// Job registry. The systemd one-shot units invoke `node dist/runner/cli.js
// <name>`, which looks up the run function here. Adding a new job means
// (a) writing a `<name>.ts` file with `runX(ctx)`, (b) listing it here,
// and (c) extending `JobName` in ./types.ts.

import { runBriefings } from './briefings.js';
import { runCoT } from './cot.js';
import { runEmbeddingBackfill } from './embedding-backfill.js';
import { runFredActuals } from './fred-actuals.js';
import { runSnapshots } from './snapshots.js';
import { runWeeklyReview } from './weekly-review.js';
import { runResonanceSync } from './resonance-sync.js';
import { runAlerts } from './alerts.js';
import { runMultiAgentAnalysis } from './multi-agent-analysis.js';
import { runRetention } from './retention.js';
import type { JobRegistration, JobName } from './types.js';

/**
 * PF-04 — Job command registry.
 *
 * Each entry defines the job's run function, schedule, description,
 * and healthchecks.io env var. The scheduler and runner CLI iterate
 * this registry instead of using if/else or switch statements.
 * Adding a new job means adding an entry here — no other files change.
 *
 * Schedule notes:
 *   - `null` means no cron schedule. Currently only multi-agent-analysis
 *     uses setTimeout-based scheduling instead of cron.
 *   - Minute-level jobs (alerts, briefings, multi-agent-analysis) are
 *     inherently idempotent and skip the daily lock.
 *   - Daily+ cadence jobs use acquireCronLock for idempotency.
 */
export const JOBS: Record<JobName, JobRegistration> = {
  alerts: {
    name: 'alerts',
    run: runAlerts,
    description: 'Evaluates user alerts every minute.',
    schedule: '* * * * *',
    hcUuidEnvVar: 'HC_JOB_ALERTS_UUID',
  },
  'embedding-backfill': {
    name: 'embedding-backfill',
    run: runEmbeddingBackfill,
    description:
      'Embed news_articles missing embeddings via the AI Gateway. Phase 8 PR-9 moved this off Vercel.',
    schedule: '0 */6 * * *',
    hcUuidEnvVar: 'HC_JOB_EMBEDDING_BACKFILL_UUID',
  },
  briefings: {
    name: 'briefings',
    run: runBriefings,
    description:
      'Pre/post-event briefings — scan economic_events for windows around high-impact releases. Phase 8 PR-10.',
    schedule: '*/5 * * * *',
    hcUuidEnvVar: 'HC_JOB_BRIEFINGS_UUID',
  },
  snapshots: {
    name: 'snapshots',
    run: runSnapshots,
    description:
      'Daily HLOC + pivots + ATR per symbol; tail-prunes candles_1m to 14 days. Phase 8 PR-11.',
    schedule: '5 0 * * *',
    hcUuidEnvVar: 'HC_JOB_SNAPSHOTS_UUID',
  },
  cot: {
    name: 'cot',
    run: runCoT,
    description: 'Weekly CFTC Commitment-of-Traders ingestion. Phase 8 PR-12.',
    schedule: '0 22 * * 5',
    hcUuidEnvVar: 'HC_JOB_COT_UUID',
  },
  'fred-actuals': {
    name: 'fred-actuals',
    run: runFredActuals,
    description:
      'Daily FRED actuals backfill — patches economic_events.actual where it was null at ingestion. Phase 8 PR-13.',
    schedule: '30 1 * * *',
    hcUuidEnvVar: 'HC_JOB_FRED_ACTUALS_UUID',
  },
  'weekly-review': {
    name: 'weekly-review',
    run: runWeeklyReview,
    description: 'Sunday weekly review — emits a single agent-authored journal review. Phase 8 PR-14.',
    schedule: '0 18 * * 0',
    hcUuidEnvVar: 'HC_JOB_WEEKLY_REVIEW_UUID',
  },
  'resonance-sync': {
    name: 'resonance-sync',
    run: runResonanceSync,
    description: 'Daily intermarket resonance sync — computes and stores real yield and DXY gold divergences.',
    schedule: '0 23 * * *',
    hcUuidEnvVar: 'HC_JOB_RESONANCE_SYNC_UUID',
  },
  'multi-agent-analysis': {
    name: 'multi-agent-analysis',
    run: runMultiAgentAnalysis,
    description: 'U2 — Polls analysis_jobs table every 3s, runs multi-agent full-mode analysis for queued jobs.',
    // Uses setTimeout-based scheduling, not cron.
    schedule: null,
  },
  retention: {
    name: 'retention',
    run: runRetention,
    description: 'DB-1 — Daily retention cleanup of telemetry, traces, rate_limits, and provider_daily_quota.',
    schedule: '15 3 * * *',
  },
};

export type { JobRegistration, JobName, JobContext, JobCoreContext, JobCancellableContext, JobResult } from './types.js';
