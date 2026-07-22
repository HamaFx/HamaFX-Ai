// SPDX-License-Identifier: Apache-2.0

// Typed client for /api/market/*. Used by hooks and AI tools.
// Phase B/P2 hardening: delegates to `api-client.ts` so market requests
// share the same timeout, CSRF, and error handling as the rest of the
// app. The old `MarketApiError` / `fetchWithTimeout` duplication is gone;
// `ApiError` from `api-client` is re-exported for backward compatibility.

import type {
  Candle,
  IndicatorKind,
  IndicatorResult,
  StructureKind,
  StructureResult,
  Symbol,
  Tick,
  Timeframe,
} from '@hamafx/shared';
import { apiFetch, ApiError } from './api-client';

/** @deprecated Use the `ApiError` class from `./api-client` directly. */
export class MarketApiError extends ApiError {}

export interface FetchOptions {
  signal?: AbortSignal;
}

/** GET /api/market/price?symbol=...&symbol=... */
export async function fetchPrices(
  symbols: readonly Symbol[],
  opts: FetchOptions = {},
): Promise<Tick[]> {
  const params = new URLSearchParams();
  for (const s of symbols) params.append('symbol', s);
  const body = await apiFetch<{ ticks: Tick[] }>(`/api/market/price?${params.toString()}`, {
    cache: 'no-store',
    ...(opts.signal ? { signal: opts.signal } : {}),
    retries: 2,
  });
  return body.ticks;
}

/** GET /api/market/candles?symbol&tf&count */
export async function fetchCandles(
  symbol: Symbol,
  tf: Timeframe,
  count = 300,
  opts: FetchOptions = {},
): Promise<Candle[]> {
  const params = new URLSearchParams({ symbol, tf, count: String(count) });
  const body = await apiFetch<{ symbol: Symbol; tf: Timeframe; candles: Candle[] }>(
    `/api/market/candles?${params.toString()}`,
    {
      cache: 'no-store',
      ...(opts.signal ? { signal: opts.signal } : {}),
      retries: 2,
    },
  );
  return body.candles;
}

export interface IndicatorRequest {
  kind: IndicatorKind;
  params?: Record<string, number | string | boolean>;
}

/** POST /api/market/indicators */
export async function fetchIndicators(
  symbol: Symbol,
  tf: Timeframe,
  indicators: readonly IndicatorRequest[],
  count = 300,
  opts: FetchOptions = {},
): Promise<IndicatorResult[]> {
  const body = await apiFetch<{ results: IndicatorResult[] }>('/api/market/indicators', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      symbol,
      tf,
      count,
      indicators: indicators.map((i) => ({ kind: i.kind, params: i.params ?? {} })),
    }),
    ...(opts.signal ? { signal: opts.signal } : {}),
    retries: 2,
  });
  return body.results;
}

export interface ChartDataResponse {
  symbol: Symbol;
  tf: Timeframe;
  count: number;
  candles: Candle[];
  results: IndicatorResult[];
}

/** POST /api/market/indicators — returns both candles and calculated indicators in one payload */
export async function fetchChartData(
  symbol: Symbol,
  tf: Timeframe,
  indicators: readonly IndicatorRequest[],
  count = 300,
  opts: FetchOptions = {},
): Promise<ChartDataResponse> {
  return apiFetch<ChartDataResponse>('/api/market/indicators', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      symbol,
      tf,
      count,
      indicators: indicators.map((i) => ({ kind: i.kind, params: i.params ?? {} })),
    }),
    ...(opts.signal ? { signal: opts.signal } : {}),
    retries: 2,
  });
}

export interface FetchStructureOptions extends FetchOptions {
  count?: number;
  kinds?: readonly StructureKind[];
  /** Swing-pivot strictness (k bars on each side). Default 3. */
  lookback?: number;
}

/** POST /api/market/structure — SMC events (swings, BOS/CHoCH, FVG, OB, liquidity). */
export async function fetchStructure(
  symbol: Symbol,
  tf: Timeframe,
  opts: FetchStructureOptions = {},
): Promise<StructureResult> {
  return apiFetch<StructureResult>('/api/market/structure', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      symbol,
      tf,
      count: opts.count ?? 300,
      ...(opts.kinds ? { kinds: opts.kinds } : {}),
      lookback: opts.lookback ?? 3,
    }),
    ...(opts.signal ? { signal: opts.signal } : {}),
    retries: 2,
  });
}
