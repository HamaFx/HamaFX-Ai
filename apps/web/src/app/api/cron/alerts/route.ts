// GET /api/cron/alerts — evaluates active, unfired alerts against the
// latest cached prices/indicators, fires email notifications via Resend,
// marks fired_at + sets active=false. Idempotent under repeat firing
// because we only consider rows with firedAt IS NULL.
//
// Cadence: 1 min on Pro (`vercel.json` crons), 5 min on Hobby external
// scheduler. The eval is fast (one cached price call per priceCross + one
// candle call per (symbol, tf) deduped via the data cache).

import { evaluateAlerts } from '@hamafx/ai';

import { withCronAuth } from '@/lib/cron';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: Request): Promise<Response> {
  return withCronAuth(req, async () => {
    const result = await evaluateAlerts({ ...(req.signal ? { signal: req.signal } : {}) });
    const errs = result.errors.length ? `, errors=${result.errors.length}` : '';
    return {
      processed: result.total,
      note: `matched=${result.matched} fired=${result.fired} skipped=${result.skipped}${errs}`,
    };
  });
}
