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
//   const allowed = await withRateLimit(user.userId, 'ai_chat', 30);
//   if (!allowed) return new Response('Too Many Requests', { status: 429 });
//
// Window is fixed at 1 minute (the rate_limits PK is keyed on a
// minute-aligned timestamp). For longer windows you'd run a separate
// aggregator — outside the scope of this helper.
//
// The implementation uses `INSERT … ON CONFLICT DO UPDATE` so the
// counter is incremented atomically under concurrent requests for the
// same user. The query returns the new count; if it exceeds `limit`
// we reject the request.

import { sql } from 'drizzle-orm';
import { getDb } from './client';

export interface RateLimitResult {
  /** True iff the request is within the limit. */
  allowed: boolean;
  /** Current count in this minute window (after this increment). */
  count: number;
  /** Configured ceiling for context (e.g. for the `X-RateLimit-Limit` header). */
  limit: number;
}

/**
 * Increment the per-user per-group counter for the current minute window.
 * Returns `{ allowed: true }` when the post-increment count is ≤ limit,
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
  // Fixed 1-minute window — the rate_limits PK is keyed on a minute-aligned
  // window_start. Longer/shorter windows require a schema change.
  const bucket = sql`date_trunc('minute', now())`;

  // Use the `rate_limits` table via schema export.
  const rows = await db.execute<{ request_count: number }>(sql`
    INSERT INTO "rate_limits" ("user_id", "endpoint_group", "window_start", "request_count")
    VALUES (${userId}, ${endpointGroup}, ${bucket}, 1)
    ON CONFLICT ("user_id", "endpoint_group", "window_start")
    DO UPDATE SET "request_count" = "rate_limits"."request_count" + 1
    RETURNING "request_count"
  `);

  // Driver-shape normalization: postgres-js (prod) returns a Result that
  // *extends Array* (no `.rows`); PGlite (dev/tests) returns `{ rows }`.
  // Read both shapes or the counter silently reads 0 in production and the
  // limit never fires. See cost.ts for the same pattern.
  const rawRows = (
    Array.isArray(rows) ? rows : ((rows as { rows?: Array<{ request_count: number }> }).rows ?? [])
  ) as Array<{ request_count: number }>;
  const count = Number(rawRows[0]?.request_count ?? 0);

  return {
    allowed: count <= limit,
    count,
    limit,
  };
}