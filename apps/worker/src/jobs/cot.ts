// Phase 8 PR-12 — `cot` weekly CFTC ingestion, migrated from
// /api/cron/cot on Vercel (route stays as manual fallback).
//
// Schedule: Friday 22:00 UTC. CFTC publishes once per week; we refresh
// the trailing 4 weeks each run so a missed schedule (worker outage,
// network blip) self-heals on the next tick. Idempotent at
// (symbol, report_date) — the upsert path on cot_reports does the right
// thing.

import { upsertCoTReport } from '@hamafx/ai';
import { cftc } from '@hamafx/data';
import { SYMBOLS, type Symbol } from '@hamafx/shared';

const { fetchLatestRows, parseCftcInt, toCftcName } = cftc;

import type { JobContext, JobResult } from './types.js';

/** Number of weekly rows to refresh on each run. */
const WEEKS = 4;

export async function runCoT(ctx: JobContext): Promise<JobResult> {
  const log = ctx.log;
  let processed = 0;
  let upserted = 0;
  const errors: Array<{ symbol: string; message: string }> = [];

  for (const symbol of SYMBOLS) {
    if (ctx.signal?.aborted) {
      log.warn('cot aborted', { processed, remaining: SYMBOLS.length - processed });
      break;
    }
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
      log.error('cot symbol failed', { symbol, err: message });
    }
  }

  log.info('cot complete', { processed, upserted, errors: errors.length });
  return {
    processed,
    note: `upserted=${upserted} errors=${errors.length}`,
  };
}

function parseReportDate(s: string): Date | null {
  if (!s || s.length < 10) return null;
  const d = new Date(`${s.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}
