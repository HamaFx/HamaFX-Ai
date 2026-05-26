// Cache key scheme: `hfx:<resource>:<symbol|null>:<tf|null>:<extra>`
//
// We keep keys short, lowercase, and stable. Add new resources here so we
// can rg(1) for "hfx:price" and find every consumer.

import type { Symbol, Timeframe } from '@hamafx/shared';

export type CacheResource =
  | 'price'
  | 'candles'
  | 'indicator'
  | 'news-list'
  | 'news-article'
  | 'calendar-day'
  | 'calendar-week'
  | 'fred-series';

export interface KeyParts {
  resource: CacheResource;
  symbol?: Symbol | null;
  tf?: Timeframe | null;
  /** Per-resource discriminator (e.g. `"ema:14"`, `"page:2"`). */
  extra?: string | null;
}

const NULL = '_';

export function cacheKey({ resource, symbol, tf, extra }: KeyParts): string {
  return ['hfx', resource, symbol ?? NULL, tf ?? NULL, extra ?? NULL].join(':');
}

/** Cache tag for group invalidation, e.g. `tag('price', 'XAUUSD')`. */
export function cacheTag(resource: CacheResource, symbol?: Symbol): string {
  return symbol ? `hfx:${resource}:${symbol}` : `hfx:${resource}`;
}
