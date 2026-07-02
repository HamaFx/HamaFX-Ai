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

// Per-resource TTL policy. Mirrors the table in docs/04-data-layer.md.
// Tweak here, not at call sites.

import type { Timeframe } from '@hamafx/shared';

export interface TtlPolicy {
  /** Soft TTL — cached value is served fresh for this long. */
  ttlSeconds: number;
  /**
   * Hard ceiling for stale-while-error fallback. The adapter may serve a
   * cached value up to `maxStaleSeconds` past `ttlSeconds` if the upstream
   * provider is failing. 0 = never serve stale.
   */
  maxStaleSeconds: number;
}

const SECOND = 1;
const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

// Phase 3 hardening §9 — `maxStaleSeconds` lowered from 30 s to 10 s.
// 30 s of stale tolerance let the chart show a noticeably stale price
// while still claiming to be live. With Phase 2 §3's tick-age plumbing
// the UI surfaces a clearer chip when the value is stale, so we don't
// need the long fallback window any more.
export const PRICE_TTL: TtlPolicy = { ttlSeconds: 3 * SECOND, maxStaleSeconds: 10 * SECOND };

/**
 * Candle TTL depends on whether we're requesting the in-progress (last) bar
 * or only fully-closed historical bars. The route handler decides which by
 * passing `lastBar: boolean`.
 */
export function candleTtl(tf: Timeframe, lastBar: boolean): TtlPolicy {
  if (!lastBar) return { ttlSeconds: 10 * MINUTE, maxStaleSeconds: 1 * DAY };
  if (tf === '1m') return { ttlSeconds: 5 * SECOND, maxStaleSeconds: 1 * MINUTE };
  return { ttlSeconds: 30 * SECOND, maxStaleSeconds: 5 * MINUTE };
}

export const NEWS_LIST_TTL: TtlPolicy = { ttlSeconds: 60 * SECOND, maxStaleSeconds: 10 * MINUTE };
export const NEWS_ARTICLE_TTL: TtlPolicy = { ttlSeconds: 24 * HOUR, maxStaleSeconds: 7 * DAY };
export const CALENDAR_DAY_TTL: TtlPolicy = { ttlSeconds: 5 * MINUTE, maxStaleSeconds: 1 * HOUR };
export const CALENDAR_WEEK_TTL: TtlPolicy = { ttlSeconds: 15 * MINUTE, maxStaleSeconds: 6 * HOUR };
export const FRED_SERIES_TTL: TtlPolicy = { ttlSeconds: 6 * HOUR, maxStaleSeconds: 7 * DAY };
