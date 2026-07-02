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

// Cache key scheme: `hfx:<resource>:<symbol|null>:<tf|null>:<extra>`
//
// We keep keys short, lowercase, and stable. Add new resources here so we
// can rg(1) for "hfx:price" and find every consumer.
//
// Phase 3 §3.10 — an optional `tenantId` prefix is supported for
// tenant-scoped cache entries. When omitted the key is global (preserving
// backward compatibility for market data that is inherently shared).

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
  /**
   * Phase 3 §3.10 — tenant namespace. When set, the key is prefixed with
   * `t:<tenantId>:` so one tenant's cached value can't collide with
   * another's. Omit for globally-shared market data.
   */
  tenantId?: string | null;
}

const NULL = '_';

export function cacheKey({ resource, symbol, tf, extra, tenantId }: KeyParts): string {
  const base = ['hfx', resource, symbol ?? NULL, tf ?? NULL, extra ?? NULL].join(':');
  return tenantId ? `t:${tenantId}:${base}` : base;
}

/** Cache tag for group invalidation, e.g. `tag('price', 'XAUUSD')`. */
export function cacheTag(resource: CacheResource, symbol?: Symbol): string {
  return symbol ? `hfx:${resource}:${symbol}` : `hfx:${resource}`;
}
