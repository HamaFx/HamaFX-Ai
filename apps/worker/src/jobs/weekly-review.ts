// Phase 8 PR-14 — `weekly-review` heavy job, migrated from
// /api/cron/weekly-review on Vercel (route stays as manual fallback).
//
// Calls `emitWeeklyReview` exactly once. Idempotent within an ISO week
// via the `briefings_emitted` PK on (`weekly_review:<isoWeek>`,
// 'weekly_review'). Schedule: Sunday 18:00 UTC.

import { emitWeeklyReview } from '@hamafx/ai';

import type { JobContext, JobResult } from './types.js';

export async function runWeeklyReview(ctx: JobContext): Promise<JobResult> {
  const r = await emitWeeklyReview();
  ctx.log.info('weekly-review complete', {
    emitted: r.emitted,
    reason: r.reason ?? '',
  });
  return {
    processed: r.emitted ? 1 : 0,
    ...(r.reason ? { note: r.reason } : {}),
  };
}
