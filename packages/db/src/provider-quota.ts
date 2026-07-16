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

// Phase J-1 — Atomic daily quota enforcement for providers with daily caps
// (e.g. TwelveData free tier 800 req/day).
//
// Uses the `provider_daily_quota` table with a single atomic
// INSERT..ON CONFLICT..DO UPDATE..RETURNING query so the check and
// increment are a single serialized operation. This is correct across
// all Vercel function instances, the worker, and any horizontal scale.
//
// Falls back gracefully when the DB is unavailable (PGlite dev mode
// or connection errors) — the caller receives `{ allowed: true }` so
// the feature degrades rather than crashing.

import { sql } from 'drizzle-orm';
import { getDb } from './client';

export interface DailyQuotaResult {
  /** Whether the request is within the daily limit. */
  allowed: boolean;
  /** Current count AFTER this increment (1-based). */
  count: number;
}

/**
 * Atomically check AND increment the daily quota counter for a provider.
 *
 * Uses `INSERT..ON CONFLICT DO UPDATE` with `RETURNING count` so the
 * entire operation is a single serialized statement. No TOCTOU race.
 *
 * @param provider - Provider identifier (e.g. 'twelvedata').
 * @param maxPerDay - Maximum allowed calls per UTC day.
 * @returns `{ allowed, count }` — `allowed` is true when count ≤ max.
 */
export async function checkAndIncrementDailyQuota(
  provider: string,
  maxPerDay: number,
): Promise<DailyQuotaResult> {
  try {
    const db = getDb();

    // db.execute() returns a RowList in drizzle-orm v0.40+.
    // Cast through unknown to access the underlying postgres-js result rows.
    const result = await db.execute(
      sql`INSERT INTO provider_daily_quota (provider, day, count)
          VALUES (${provider}, CURRENT_DATE, 1)
          ON CONFLICT (provider, day)
          DO UPDATE SET count = provider_daily_quota.count + 1
          RETURNING count`,
    );

    const rows = (result as unknown as Array<{ count: number }>);
    const count = Number(rows[0]?.count ?? 0);

    return { allowed: count <= maxPerDay, count };
  } catch (err) {
    // DB unavailable (PGlite dev mode, connection error, etc.).
    // Fail-open: let the request through; the provider's own 429
    // response is the backstop.
    console.warn('[provider-quota] DB unavailable — daily quota bypassed',
      { provider, err: (err as Error)?.message ?? String(err) });
    return { allowed: true, count: 0 };
  }
}
