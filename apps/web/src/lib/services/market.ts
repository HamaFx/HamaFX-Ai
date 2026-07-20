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

// PF-22 — Market data service layer.
//
// Handles read-heavy market data operations: candles, prices, search,
// indicators. All routes are auth-gated to prevent anonymous scraping.
//
// Pattern: Service (PF-22). Controllers remain thin: parse request →
// call service → format Response.

import { getCandlesWithMeta, getPriceWithMeta, getCandles, getDefaultCache } from '@hamafx/data';
import { computeIndicator } from '@hamafx/indicators';
import {
  BUILTIN_SYMBOLS,
  type IndicatorResult,
  type Tick,
} from '@hamafx/shared';
import { schema, withRateLimit, withTenantDbRO } from '@hamafx/db';
import { decryptByok } from '@hamafx/shared/encryption';
import { eq } from 'drizzle-orm';
import type { Candle } from '@hamafx/shared';

// ── DTOs ─────────────────────────────────────────────────────────────────────

export interface CandleResultDTO {
  symbol: string;
  tf: string;
  candles: unknown[];
  stale: boolean;
  producedAt: number;
}

export interface TickWithMetaDTO extends Tick {
  stale: boolean;
  producedAt: number;
  ageMs: number | null;
}

export interface PriceResultDTO {
  ticks: TickWithMetaDTO[];
  anyStale: boolean;
}

export interface SearchResultDTO {
  results: Array<{ symbol: string; display: string; category: string }>;
}

export interface IndicatorResultDTO {
  symbol: string;
  tf: string;
  count: number;
  candles: unknown[];
  results: IndicatorResult[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Load the user's API keys and preferred market data provider.
 * Uses read-replica (withTenantDbRO) since this is a read-only query.
 */
async function loadUserMarketPrefs(
  userId: string,
): Promise<{ finnhubKey: string; marketDataProvider: string }> {
  const [settings] = await withTenantDbRO(userId, async (db) => {
    const rows = await db
      .select({
        aiApiKeys: schema.userSettings.aiApiKeys,
        marketDataProvider: schema.userSettings.marketDataProvider,
      })
      .from(schema.userSettings)
      .where(eq(schema.userSettings.userId, userId));
    return rows;
  });

  const decrypted = settings?.aiApiKeys ? decryptByok(settings.aiApiKeys) : null;
  return {
    finnhubKey: (decrypted?.finnhub as string) ?? '',
    marketDataProvider: (settings?.marketDataProvider as string) ?? 'biquote',
  };
}

/** Shared rate limit check for market read endpoints. */
const MARKET_READ_RATE_LIMIT = Number(process.env.MARKET_READ_RATE_LIMIT) || 120;

export async function checkMarketRateLimit(userId: string): Promise<{
  allowed: boolean;
  count: number;
  limit: number;
}> {
  const rl = await withRateLimit(userId, 'market_read', MARKET_READ_RATE_LIMIT);
  return { allowed: rl.allowed, count: rl.count, limit: rl.limit };
}

// ── Service functions ────────────────────────────────────────────────────────

type Timeframe = '1m' | '5m' | '15m' | '30m' | '1h' | '4h' | '1d' | '1w';

export async function getCandlesService(
  userId: string,
  symbol: string,
  tf: Timeframe,
  count: number,
): Promise<CandleResultDTO> {
  const { finnhubKey, marketDataProvider } = await loadUserMarketPrefs(userId);

  const r = await getCandlesWithMeta(symbol, tf, {
    count,
    apiKeys: { finnhub: finnhubKey },
    marketDataProvider,
  });

  return { symbol, tf, candles: r.candles, stale: r.stale, producedAt: r.producedAt };
}

export async function getPriceService(
  userId: string,
  symbols: string[],
): Promise<PriceResultDTO> {
  const { finnhubKey, marketDataProvider } = await loadUserMarketPrefs(userId);

  const results = await Promise.all(
    symbols.map((s) =>
      getPriceWithMeta(s, {
        apiKeys: { finnhub: finnhubKey },
        marketDataProvider,
      }),
    ),
  );

  const ticks: TickWithMetaDTO[] = results.map((r) => ({
    ...r.tick,
    stale: r.stale,
    producedAt: r.producedAt,
    ageMs: r.ageMs,
  }));

  const anyStale = ticks.some((t) => t.stale);
  return { ticks, anyStale };
}

export function searchSymbolsService(query: string, limit: number): SearchResultDTO {
  const q = query.toUpperCase();
  const results = BUILTIN_SYMBOLS
    .filter((s) => s.internal.includes(q) || s.display.toUpperCase().includes(q))
    .slice(0, limit)
    .map((s) => ({ symbol: s.internal, display: s.display, category: s.category }));

  return { results };
}

const INDICATOR_CACHE_TTL = 30;

export async function getIndicatorsService(
  userId: string,
  symbol: string,
  tf: Timeframe,
  count: number,
  indicatorList: Array<{ kind: string; params: Record<string, unknown> }>,
): Promise<IndicatorResultDTO> {
  const { finnhubKey, marketDataProvider } = await loadUserMarketPrefs(userId);

  // Build a stable cache key from the full request signature.
  const key = ['indicator', symbol, tf, String(count), ...indicatorList.map((i) => i.kind)].join(':');
  const cache = await getDefaultCache();

  const { value } = await cache.fetchWithMeta<{ candles: Candle[]; results: IndicatorResult[] }>(
    key,
    async () => {
      const candles = await getCandles(symbol, tf, {
        count,
        apiKeys: { finnhub: finnhubKey },
        marketDataProvider,
      });
      const results: IndicatorResult[] = indicatorList.map(({ kind, params }) =>
        computeIndicator({
          symbol,
          tf,
          kind: kind as Parameters<typeof computeIndicator>[0]['kind'],
          params,
          candles,
        }),
      );
      return { candles, results };
    },
    { ttlSeconds: INDICATOR_CACHE_TTL },
  );

  return {
    symbol,
    tf,
    count: value.candles.length,
    candles: value.candles,
    results: value.results,
  };
}
