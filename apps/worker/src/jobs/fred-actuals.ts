// Phase 8 PR-13 — `fred-actuals` daily backfill, migrated from
// /api/cron/fred-actuals on Vercel (route stays as manual fallback).
//
// Patches `economic_events.actual` for FRED rows whose value was null at
// ingestion time. Schedule: 01:30 UTC daily — most US BLS data has
// landed by then. Idempotent: only patches rows where
// `actuals_filled_at IS NULL`.

import { listFredEventsMissingActual, parseFredEventId, patchEventActual } from '@hamafx/ai';
import { fred } from '@hamafx/data';

const { fetchObservations, fredMeta } = fred;

import type { JobContext, JobResult } from './types.js';

/** Look-back window for the observation query (FRED is sometimes late). */
const LOOKBACK_DAYS = 7;

export async function runFredActuals(ctx: JobContext): Promise<JobResult> {
  const log = ctx.log;
  const apiKey = process.env['FRED_API_KEY'];
  if (!apiKey) {
    log.warn('FRED_API_KEY missing — skipping');
    return { processed: 0, note: 'FRED_API_KEY missing' };
  }

  const candidates = await listFredEventsMissingActual({ until: new Date() });
  let filled = 0;
  let skipped = 0;
  const errors: Array<{ id: string; message: string }> = [];

  for (const ev of candidates) {
    if (ctx.signal?.aborted) {
      log.warn('fred-actuals aborted', { filled, skipped, remaining: candidates.length - filled - skipped });
      break;
    }

    const parsed = parseFredEventId(ev.id);
    if (!parsed) {
      skipped += 1;
      continue;
    }
    const meta = fredMeta(parsed.releaseId);
    if (!meta?.seriesId) {
      skipped += 1;
      continue;
    }

    try {
      const start = shiftIso(parsed.releaseDate, -LOOKBACK_DAYS);
      const end = shiftIso(parsed.releaseDate, +LOOKBACK_DAYS);
      const obs = await fetchObservations({
        apiKey,
        seriesId: meta.seriesId,
        start,
        end,
      });
      if (obs.length === 0) continue;

      // Pick the observation closest to the release date.
      const target = parsed.releaseDate;
      obs.sort(
        (a, b) =>
          Math.abs(daysBetween(a.date, target)) - Math.abs(daysBetween(b.date, target)),
      );
      const pick = obs[0]!;
      await patchEventActual(ev.id, pick.value, new Date());
      filled += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push({ id: ev.id, message });
      log.error('fred-actuals patch failed', { id: ev.id, err: message });
    }
  }

  log.info('fred-actuals complete', {
    candidates: candidates.length,
    filled,
    skipped,
    errors: errors.length,
  });
  return {
    processed: candidates.length,
    note: `filled=${filled}, skipped=${skipped}, errors=${errors.length}`,
  };
}

function shiftIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysBetween(a: string, b: string): number {
  const da = Date.parse(`${a}T00:00:00Z`);
  const db = Date.parse(`${b}T00:00:00Z`);
  return (da - db) / (24 * 60 * 60 * 1000);
}
