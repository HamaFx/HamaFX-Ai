// GET /api/cron/snapshots — daily HLOC, pivots, ATR, key levels per
// symbol → snapshots table.
//
// Status: deferred to Phase 2. The current chart + agent path computes
// these on demand from cached candles, so a precomputed daily snapshot
// adds latency-free reads but isn't required for any Phase 1 acceptance
// prompt. Implement when the briefings feature lands.

import { withCronAuth } from '@/lib/cron';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<Response> {
  return withCronAuth(req, async () => ({
    processed: 0,
    note: 'deferred to Phase 2 (briefings)',
  }));
}
