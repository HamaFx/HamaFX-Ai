// GET /api/cron/snapshots — Vercel Cron, daily at 23:55 UTC.
// Computes daily HLOC, pivots, ATR, key levels per symbol → snapshots table.
// Phase-0 stub.

import { withCronAuth } from '@/lib/cron';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<Response> {
  return withCronAuth(req, async () => ({
    processed: 0,
    note: 'phase-0 stub — implement in Phase 1a/1c',
  }));
}
