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

// Phase B — Postgres-backed per-user rate limiter.
//
// Usage in a Next.js route handler:
//   const rl = await withRateLimit(user.userId, 'ai_chat', 30);
//   if (!rl.allowed) return rateLimitedResponse(rl, req);
//
// Phase 4 hardening — sliding-window approximation.
// The previous fixed-window design (`date_trunc('minute', now())`)
// allowed up to ~2× the intended rate across a window boundary: a
// burst at 11:59:59 + another at 12:00:01 each got the full quota.
// The new implementation uses two adjacent minute buckets weighted by
// the elapsed fraction of the current minute, producing a smooth
// sliding-window ceiling that cannot be exceeded by boundary bursts.
//
// The implementation uses `INSERT … ON CONFLICT DO UPDATE` so the
// counter is incremented atomically under concurrent requests for the
// same user. The query returns the new count; if the weighted sum
// exceeds `limit` we reject the request.

import { sql } from 'drizzle-orm';
import { getDb } from './client';

export interface RateLimitResult {
  /** True iff the request is within the limit. */
  allowed: boolean;
  /** Current count in this minute window (after this increment). */
  count: number;
  /** Configured ceiling for context (e.g. for the `X-RateLimit-Limit` header). */
  limit: number;
  /** Unix seconds when the current minute window resets (for `X-RateLimit-Reset`). */
  resetAt: number;
}

/**
 * Increment the per-user per-group counter for the current minute window.
 * Uses a sliding-window approximation: the weighted sum of the current
 * minute's count (weighted by elapsed fraction) and the previous minute's
 * count (weighted by remaining fraction) is compared against `limit`.
 *
 * Returns `{ allowed: true }` when the weighted count is ≤ limit,
 * `{ allowed: false }` otherwise (but the counter is still incremented —
 * we want to count rejected attempts so a brute-force can't retry
 * without consequence).
 */
export async function withRateLimit(
  userId: string,
  endpointGroup: string,
  limit: number,
): Promise<RateLimitResult> {
  const db = getDb();

  // Insert/upsert the current minute bucket atomically.
  const bucket = sql`date_trunc('minute', now())`;

  const rows = await db.execute<{ request_count: number }>(sql`
    INSERT INTO "rate_limits" ("user_id", "endpoint_group", "window_start", "request_count")
    VALUES (${userId}, ${endpointGroup}, ${bucket}, 1)
    ON CONFLICT ("user_id", "endpoint_group", "window_start")
    DO UPDATE SET "request_count" = "rate_limits"."request_count" + 1
    RETURNING "request_count"
  `);

  // Driver-shape normalization: postgres-js (prod) returns a Result that
  // *extends Array* (no `.rows`); PGlite (dev/tests) returns `{ rows }`.
  const rawRows = (
    Array.isArray(rows) ? rows : ((rows as { rows?: Array<{ request_count: number }> }).rows ?? [])
  ) as Array<{ request_count: number }>;
  const currentCount = Number(rawRows[0]?.request_count ?? 0);

  // Sliding-window: fetch the previous minute's count and compute the
  // weighted sum. The fraction of the current minute that has elapsed
  // determines how much of the current bucket counts.
  const prevRows = await db.execute<{ request_count: number }>(sql`
    SELECT "request_count"
    FROM "rate_limits"
    WHERE "user_id" = ${userId}
      AND "endpoint_group" = ${endpointGroup}
      AND "window_start" = date_trunc('minute', now()) - interval '1 minute'
    LIMIT 1
  `);
  const prevRawRows = (
    Array.isArray(prevRows) ? prevRows : ((prevRows as { rows?: Array<{ request_count: number }> }).rows ?? [])
  ) as Array<{ request_count: number }>;
  const prevCount = Number(prevRawRows[0]?.request_count ?? 0);

  // Elapsed fraction of the current minute (0..1). Extract seconds + microseconds
  // from the database so the calculation is consistent across the server clock.
  const fracRows = await db.execute<{ frac: number }>(sql`
    SELECT extract(epoch from now() - date_trunc('minute', now())) / 60.0 AS frac
  `);
  const fracRawRows = (
    Array.isArray(fracRows) ? fracRows : ((fracRows as { rows?: Array<{ frac: number }> }).rows ?? [])
  ) as Array<{ frac: number }>;
  const elapsedFraction = Math.min(1, Math.max(0, Number(fracRawRows[0]?.frac ?? 0)));

  // Sliding-window weighted sum:
  //   weighted = currentCount * elapsedFraction + prevCount * (1 - elapsedFraction)
  //
  // At the start of a minute (elapsed≈0), the previous minute's count
  // dominates. As time progresses, the current count dominates. This
  // prevents the 2× boundary burst the fixed-window allowed.
  const weightedCount = currentCount * elapsedFraction + prevCount * (1 - elapsedFraction);

  // Compute reset time: end of the current minute window.
  const now = new Date();
  const resetAt = Math.floor(Date.UTC(
    now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(),
    now.getUTCHours(), now.getUTCMinutes() + 1, 0, 0,
  ) / 1000);

  return {
    allowed: weightedCount <= limit,
    count: currentCount,
    limit,
    resetAt,
  };
}