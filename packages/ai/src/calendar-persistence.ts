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

// Calendar persistence — upsert EconomicEvent[] into the DB.
// Same shape as news-persistence.ts so the cron handler stays uniform.

import { schema } from '@hamafx/db';
import { getDb } from './db';
import type { EconomicEvent, EventCurrency, Importance } from '@hamafx/shared';
import { and, eq, isNull, lt } from 'drizzle-orm';

export async function upsertEvents(
  events: EconomicEvent[],
): Promise<{ inserted: number; skipped: number }> {
  if (events.length === 0) return { inserted: 0, skipped: 0 };

  const rows = events.map((e) => ({
    id: e.id,
    title: e.title,
    country: e.country,
    currency: e.currency,
    importance: e.importance,
    date: new Date(e.date),
    actual: e.actual,
    forecast: e.forecast,
    previous: e.previous,
    unit: e.unit,
    source: e.source,
  }));

  // ON CONFLICT (id) DO UPDATE — we DO want to refresh actual/forecast/previous
  // when a release is reported, since FRED schedules ahead of time and the
  // numeric fields land later.
  const inserted = await getDb()
    .insert(schema.economicEvents)
    .values(rows)
    .onConflictDoUpdate({
      target: schema.economicEvents.id,
      set: {
        actual: schema.economicEvents.actual,
        forecast: schema.economicEvents.forecast,
        previous: schema.economicEvents.previous,
        date: schema.economicEvents.date,
      },
    })
    .returning({ id: schema.economicEvents.id });

  return { inserted: inserted.length, skipped: 0 };
}


// ---------------------------------------------------------------------------
// FRED actuals backfill helpers
// ---------------------------------------------------------------------------

/**
 * List FRED-sourced events whose `actual` is still null and whose `date` has
 * already passed — these are candidates for the actuals-backfill cron.
 */
export async function listFredEventsMissingActual(args: {
  until?: Date;
  limit?: number;
}): Promise<EconomicEvent[]> {
  const cutoff = args.until ?? new Date();
  const rows = await getDb()
    .select()
    .from(schema.economicEvents)
    .where(
      and(
        eq(schema.economicEvents.source, 'fred'),
        isNull(schema.economicEvents.actual),
        lt(schema.economicEvents.date, cutoff),
      ),
    )
    .limit(args.limit ?? 200);

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    country: r.country,
    currency: (r.currency as EventCurrency | null) ?? null,
    importance: r.importance as Importance,
    date: r.date.getTime(),
    actual: r.actual,
    forecast: r.forecast,
    previous: r.previous,
    unit: r.unit,
    source: r.source,
  }));
}

/**
 * Patch a single event's `actual` value and stamp `actuals_filled_at`. We
 * only set the timestamp when the column is currently null so re-runs
 * don't overwrite an existing fill timestamp.
 */
export async function patchEventActual(
  id: string,
  value: number,
  filledAt: Date,
): Promise<void> {
  await getDb()
    .update(schema.economicEvents)
    .set({ actual: value, actualsFilledAt: filledAt })
    .where(and(eq(schema.economicEvents.id, id), isNull(schema.economicEvents.actualsFilledAt)));
}

/**
 * Parse the FRED-prefixed event id back into its `(releaseId, releaseDate)`
 * tuple. Returns `null` for ids that don't match the prefix shape.
 */
export function parseFredEventId(
  id: string,
): { releaseId: number; releaseDate: string } | null {
  const m = /^fred:(\d+):(\d{4}-\d{2}-\d{2})$/.exec(id);
  if (!m) return null;
  const releaseId = Number(m[1]);
  if (!Number.isFinite(releaseId)) return null;
  return { releaseId, releaseDate: m[2]! };
}
