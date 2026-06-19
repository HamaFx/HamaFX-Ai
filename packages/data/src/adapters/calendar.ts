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

// Calendar adapter — Phase 1c MVP.
//
// FRED gives us release SCHEDULES (when an indicator is published), not
// forecasts/actuals. That's enough for the agent to answer "when is the next
// NFP?" and to render an upcoming-events list. Forecast/actual lookup is a
// follow-up that pulls from `/fred/series/observations` after release.

import { EconomicEventSchema, type EconomicEvent } from '@hamafx/shared';

import { ProviderError } from '../errors';
import { fetchReleaseDates, FRED_RELEASES, fredMeta } from '../providers/fred';

export interface FetchCalendarOptions {
  /** Window start (default: now). */
  fromMs?: number;
  /** Window end (default: now + 14 days). */
  toMs?: number;
  signal?: AbortSignal;
  apiKeys?: Partial<{ fred: string }>;
}

const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;

function resolveKeys(opts: FetchCalendarOptions) {
  return { fred: opts.apiKeys?.fred ?? process.env.FRED_API_KEY ?? '' };
}

function isoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Build the upcoming events list. We:
 *   1. Pull all release dates in the window from FRED.
 *   2. Filter to the curated `FRED_RELEASES` set.
 *   3. Map to EconomicEvent with a stable id of `fred:<release_id>:<YYYY-MM-DD>`.
 *
 * No forecast / actual / previous values yet — they're nullable in the schema
 * and the UI/agent both render fine without them.
 */
export async function fetchUpcomingEvents(
  opts: FetchCalendarOptions = {},
): Promise<EconomicEvent[]> {
  const keys = resolveKeys(opts);
  if (!keys.fred) {
    throw new ProviderError(
      'NO_PROVIDER_AVAILABLE',
      'none',
      'no calendar provider configured (set FRED_API_KEY)',
    );
  }

  const fromMs = opts.fromMs ?? Date.now();
  const toMs = opts.toMs ?? fromMs + FOURTEEN_DAYS_MS;

  const releaseDates = await fetchReleaseDates({
    apiKey: keys.fred,
    from: isoDate(fromMs),
    to: isoDate(toMs),
    ...(opts.signal ? { signal: opts.signal } : {}),
  });

  const out: EconomicEvent[] = [];
  for (const r of releaseDates) {
    const meta = fredMeta(r.release_id);
    if (!meta) continue; // skip releases not in our curated map
    const dateMs = Date.parse(`${r.date}T13:30:00Z`); // FRED dates are date-only; assume US BLS 8:30 ET (~13:30 UTC)
    if (Number.isNaN(dateMs)) continue;
    if (dateMs < fromMs || dateMs > toMs) continue;
    out.push(
      EconomicEventSchema.parse({
        id: `fred:${r.release_id}:${r.date}`,
        title: meta.title,
        country: meta.country,
        currency: meta.currency,
        importance: meta.importance,
        date: dateMs,
        actual: null,
        forecast: null,
        previous: null,
        unit: null,
        source: 'fred',
      }),
    );
  }
  return out.sort((a, b) => a.date - b.date);
}

/** Convenience: ids of releases we know about (UI / tests). */
export const CURATED_FRED_RELEASE_IDS = Object.keys(FRED_RELEASES).map(Number);
