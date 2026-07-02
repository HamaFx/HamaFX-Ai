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
import { runSpendAnomaly } from './spend-anomaly.js';
import type { JobFn, JobName } from './types.js';

export const JOBS: Record<JobName, { run: JobFn; description: string }> = {
  alerts: {
    run: runAlerts,
    description: 'Evaluates user alerts every minute.',
  },
  'embedding-backfill': {
    run: runEmbeddingBackfill,
    description:
      'Embed news_articles missing embeddings via the AI Gateway. Phase 8 PR-9 moved this off Vercel.',
  },
  briefings: {
    run: runBriefings,
    description:
      'Pre/post-event briefings — scan economic_events for windows around high-impact releases. Phase 8 PR-10.',
  },
  snapshots: {
    run: runSnapshots,
    description:
      'Daily HLOC + pivots + ATR per symbol; tail-prunes candles_1m to 14 days. Phase 8 PR-11.',
  },
  cot: {
    run: runCoT,
    description: 'Weekly CFTC Commitment-of-Traders ingestion. Phase 8 PR-12.',
  },
  'fred-actuals': {
    run: runFredActuals,
    description:
      'Daily FRED actuals backfill — patches economic_events.actual where it was null at ingestion. Phase 8 PR-13.',
  },
  'weekly-review': {
    run: runWeeklyReview,
    description: 'Sunday weekly review — emits a single agent-authored journal review. Phase 8 PR-14.',
  },
  'resonance-sync': {
    run: runResonanceSync,
    description: 'Daily intermarket resonance sync — computes and stores real yield and DXY gold divergences.',
  },
  'spend-anomaly': {
    run: runSpendAnomaly,
    description: 'Phase 4 — operator-side spend-anomaly detector. Z-score query against daily_ai_spend; captures to Sentry + pages operator.',
  },
};

export type { JobFn, JobName, JobContext, JobResult } from './types.js';
