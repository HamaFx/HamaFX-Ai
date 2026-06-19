/**
 * Copyright 2026 HamaFX
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// GET /api/cron/fred-actuals — backfill `economic_events.actual` for FRED
// rows whose value was null at ingestion time.
//
// Phase 8 PR-13: this route is now a **manual-fallback path**. The
// scheduled invocation runs on the GCE worker via
// `hamafx-job-fred-actuals.timer`.
//
// Cadence: 30 1 * * * UTC (just past midnight US east coast — most BLS
// data has landed by this hour).
//
// Idempotent: only patches rows where `actuals_filled_at IS NULL`.

import { listFredEventsMissingActual, parseFredEventId, patchEventActual } from '@hamafx/ai';
import { fetchObservations, fredMeta } from '@hamafx/data/providers/fred';

import { withCronAuth } from '@/lib/cron';
import { getServerEnv } from '@/lib/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Look-back window for the observation query. FRED can take a few days to
 * publish; we ask for ±7 days around the release date so a late-arriving
 * value still lands.
 */
const LOOKBACK_DAYS = 7;

export async function GET(req: Request): Promise<Response> {
  return withCronAuth(req, async () => {
    const env = getServerEnv();
    if (!env.FRED_API_KEY) {
      return { processed: 0, note: 'FRED_API_KEY missing' };
    }

    const candidates = await listFredEventsMissingActual({ until: new Date() });
    let filled = 0;
    let skipped = 0;
    const errors: Array<{ id: string; message: string }> = [];

    for (const ev of candidates) {
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
          apiKey: env.FRED_API_KEY,
          seriesId: meta.seriesId,
          start,
          end,
        });
        if (obs.length === 0) continue;

        // Pick the observation closest to the release date.
        const target = parsed.releaseDate;
        obs.sort((a, b) => Math.abs(daysBetween(a.date, target)) - Math.abs(daysBetween(b.date, target)));
        const pick = obs[0]!;
        await patchEventActual(ev.id, pick.value, new Date());
        filled += 1;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        errors.push({ id: ev.id, message });
        console.error(`[cron fred-actuals] ${ev.id} failed: ${message}`);
      }
    }

    return {
      processed: candidates.length,
      note: `filled=${filled}, skipped=${skipped}, errors=${errors.length}`,
    };
  });
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
