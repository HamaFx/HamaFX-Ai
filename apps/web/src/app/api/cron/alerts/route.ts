// GET /api/cron/alerts — Vercel Cron, every 1 min (Pro) / 2-5 min (Hobby).
// Reads active alerts, evaluates against latest cached prices/indicators,
// fires email/Telegram on match, marks fired_at idempotently. Phase-0 stub.

import { withCronAuth } from '@/lib/cron';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<Response> {
  return withCronAuth(req, async () => ({
    processed: 0,
    note: 'phase-0 stub — implement in Phase 1d',
  }));
}
