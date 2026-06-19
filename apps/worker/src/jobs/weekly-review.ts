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

// Phase 8 PR-14 — `weekly-review` heavy job, migrated from
// /api/cron/weekly-review on Vercel (route stays as manual fallback).
//
// Calls `emitWeeklyReview` exactly once. Idempotent within an ISO week
// via the `briefings_emitted` PK on (`weekly_review:<isoWeek>`,
// 'weekly_review'). Schedule: Sunday 18:00 UTC.

import { emitWeeklyReview } from '@hamafx/ai';

import { getDb, schema } from '@hamafx/db';

import type { JobContext, JobResult } from './types.js';

export async function runWeeklyReview(ctx: JobContext): Promise<JobResult> {
  const db = getDb();
  const users = await db.select({ id: schema.users.id }).from(schema.users);
  
  let emittedCount = 0;
  for (const u of users) {
    if (ctx.signal?.aborted) break;
    try {
      const r = await emitWeeklyReview(u.id);
      if (r.emitted) emittedCount++;
    } catch (err) {
      ctx.log.error('weekly-review failed for user', { userId: u.id, err: String(err) });
    }
  }

  ctx.log.info('weekly-review complete', {
    emitted: emittedCount,
  });
  return {
    processed: emittedCount,
  };
}
