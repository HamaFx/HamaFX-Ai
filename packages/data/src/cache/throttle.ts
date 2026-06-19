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

import { getDb } from '@hamafx/db';
import { providerThrottle } from '@hamafx/db/schema';
import { sql } from 'drizzle-orm';

// Per-provider self-throttle.
//
// Phase 7a — adaptive throttle: when an upstream returns 429 we lower the
// effective cap to a configurable fraction (default 80 %) for the next
// `cooloffMs`. The cap recovers automatically when the cooloff elapses.
//
// Phase 2 hardening §5 — Postgres-backed throttle counter.
//
// The limit is shared across all function instances by using a Postgres table:
// `provider_throttle(provider, window_started_at, count, backoff_until)`.

export interface ThrottleConfig {
  /** Max calls allowed per window. */
  limit: number;
  /** Window length in ms. */
  windowMs: number;
  /**
   * After a 429-style backoff signal, drop the effective cap to this
   * fraction of `limit` for `cooloffMs`. Default 0.8.
   */
  backoffFraction?: number;
  /** ms the reduced cap stays in effect after a backoff. Default 90s. */
  cooloffMs?: number;
}

interface Bucket {
  /** Calls counted within the current window. */
  count: number;
  /** ms epoch UTC when the current window started. */
  windowStart: number;
  /** ms epoch UTC when the current backoff (if any) lifts. 0 = no backoff. */
  backoffUntil: number;
}

const buckets = new Map<string, Bucket>();

function getBucket(provider: string, now: number): Bucket {
  const existing = buckets.get(provider);
  if (existing) return existing;
  const fresh: Bucket = { count: 0, windowStart: now, backoffUntil: 0 };
  buckets.set(provider, fresh);
  return fresh;
}

function effectiveLimit(cfg: ThrottleConfig, b: Bucket, now: number): number {
  if (b.backoffUntil > now) {
    const fraction = cfg.backoffFraction ?? 0.8;
    return Math.max(1, Math.floor(cfg.limit * fraction));
  }
  return cfg.limit;
}

/**
 * Reserve one call against `provider`. Returns true if allowed.
 * Auto-rolls the window forward when expired.
 */
export async function tryReserve(provider: string, cfg: ThrottleConfig): Promise<boolean> {
  const now = new Date();

  if (process.env.THROTTLE_BACKEND !== 'postgres') {
    const b = getBucket(provider, now.getTime());
    if (now.getTime() - b.windowStart >= cfg.windowMs) {
      b.count = 1;
      b.windowStart = now.getTime();
      return true;
    }
    if (b.count >= effectiveLimit(cfg, b, now.getTime())) return false;
    b.count += 1;
    return true;
  }

  const db = getDb();
  const backoffFrac = cfg.backoffFraction ?? 0.8;

  const result = await db.insert(providerThrottle)
    .values({
      provider,
      windowStartedAt: now,
      count: 1,
      backoffUntil: new Date(0),
    })
    .onConflictDoUpdate({
      target: providerThrottle.provider,
      set: {
        count: sql`CASE 
          WHEN ${providerThrottle.windowStartedAt} + interval '1 millisecond' * ${cfg.windowMs} <= ${now} THEN 1
          ELSE ${providerThrottle.count} + 1
        END`,
        windowStartedAt: sql`CASE 
          WHEN ${providerThrottle.windowStartedAt} + interval '1 millisecond' * ${cfg.windowMs} <= ${now} THEN ${now}
          ELSE ${providerThrottle.windowStartedAt}
        END`
      },
      where: sql`
        (${providerThrottle.windowStartedAt} + interval '1 millisecond' * ${cfg.windowMs} <= ${now})
        OR
        (
          ${providerThrottle.count} < CASE
            WHEN ${providerThrottle.backoffUntil} > ${now} THEN GREATEST(1, FLOOR(${cfg.limit} * ${backoffFrac}))
            ELSE ${cfg.limit}
          END
        )
      `
    })
    .returning({ count: providerThrottle.count });

  return result.length > 0;
}

/**
 * Signal that the upstream just returned a quota / rate-limit response.
 * The next call to `tryReserve` will see the reduced cap; the cap recovers
 * automatically after `cooloffMs`.
 */
export async function noteBackoff(provider: string, cfg: ThrottleConfig): Promise<void> {
  const now = new Date();
  const cooloff = cfg.cooloffMs ?? 90_000;
  const until = new Date(now.getTime() + cooloff);

  if (process.env.THROTTLE_BACKEND !== 'postgres') {
    const b = getBucket(provider, now.getTime());
    b.backoffUntil = until.getTime();
    return;
  }

  const db = getDb();
  await db.insert(providerThrottle)
    .values({
      provider,
      windowStartedAt: now,
      count: 1,
      backoffUntil: until,
    })
    .onConflictDoUpdate({
      target: providerThrottle.provider,
      set: {
        backoffUntil: until,
      }
    });
}

/** Test helper. */
export function _resetThrottle(): void {
  buckets.clear();
}
