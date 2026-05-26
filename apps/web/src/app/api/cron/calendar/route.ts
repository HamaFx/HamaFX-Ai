// GET /api/cron/calendar — Vercel Cron, every 15 min.
// Pulls Trading Economics + FRED, upserts economic_events.
// Phase-0 stub.

import { withCronAuth } from '@/lib/cron';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<Response> {
  return withCronAuth(req, async () => ({
    processed: 0,
    note: 'phase-0 stub — implement in Phase 1c',
  }));
}
