// GET /api/cron/weekly-review — Sunday 18:00 UTC.
//
// Calls `emitWeeklyReview` exactly once. Idempotent within an ISO week
// via `briefings_emitted` PK on (`weekly_review:<isoWeek>`, 'weekly_review').

import { emitWeeklyReview } from '@hamafx/ai';

import { withCronAuth } from '@/lib/cron';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<Response> {
  return withCronAuth(req, async () => {
    const r = await emitWeeklyReview();
    return {
      processed: r.emitted ? 1 : 0,
      ...(r.reason ? { note: r.reason } : {}),
    };
  });
}
