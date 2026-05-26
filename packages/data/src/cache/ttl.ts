// Per-resource TTL policy. Mirrors the table in docs/06-data-sources.md.
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

export const PRICE_TTL: TtlPolicy = { ttlSeconds: 3 * SECOND, maxStaleSeconds: 30 * SECOND };

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
