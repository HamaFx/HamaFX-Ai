// GET /api/cron/cot — weekly CFTC Commitment-of-Traders ingestion.
//
// Runs Friday 22:00 UTC (just after CFTC's weekly publication window).
// Idempotent: each `(symbol, report_date)` row is keyed by a deterministic
// `cftc:<symbol>:<YYYY-MM-DD>` PK and upserted with ON CONFLICT DO UPDATE.

import { upsertCoTReport } from '@hamafx/ai';
import { fetchLatestRows, parseCftcInt, toCftcName } from '@hamafx/data/providers/cftc';
import { SYMBOLS, type Symbol } from '@hamafx/shared';

import { withCronAuth } from '@/lib/cron';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Number of weekly rows to refresh on each run. */
const WEEKS = 4;

export async function GET(req: Request): Promise<Response> {
  return withCronAuth(req, async () => {
    let processed = 0;
    let upserted = 0;
    const errors: Array<{ symbol: string; message: string }> = [];

    for (const symbol of SYMBOLS) {
      try {
        const rows = await fetchLatestRows({
          commodityName: toCftcName(symbol as Symbol),
          weeks: WEEKS,
        });
        for (const row of rows) {
          const date = parseReportDate(row.report_date_as_yyyy_mm_dd);
          if (!date) continue;
          await upsertCoTReport({
            symbol,
            reportDate: date,
            dealerLong: parseCftcInt(row.dealer_positions_long_all),
            dealerShort: parseCftcInt(row.dealer_positions_short_all),
            assetLong: parseCftcInt(row.asset_mgr_positions_long_all),
            assetShort: parseCftcInt(row.asset_mgr_positions_short_all),
            leveragedLong: parseCftcInt(row.lev_money_positions_long_all),
            leveragedShort: parseCftcInt(row.lev_money_positions_short_all),
            otherLong: parseCftcInt(row.other_rept_positions_long_all),
            otherShort: parseCftcInt(row.other_rept_positions_short_all),
            raw: row,
          });
          upserted += 1;
        }
        processed += 1;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        errors.push({ symbol, message });
        console.error(`[cron cot] ${symbol} failed: ${message}`);
      }
    }

    return {
      processed,
      note: `upserted=${upserted} errors=${errors.length}`,
    };
  });
}

function parseReportDate(s: string): Date | null {
  if (!s || s.length < 10) return null;
  const d = new Date(`${s.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}
