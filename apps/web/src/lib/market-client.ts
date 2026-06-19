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

// Typed client for /api/market/*. Used by hooks and AI tools.
// Centralises:
//   - URL building
//   - JSON parsing with the error envelope from src/lib/api.ts
//   - response shape typing (no zod here — the routes already validate; we
//     trust them and keep the client tiny)

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

export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
}

export class MarketApiError extends Error {
  readonly code: string;
  readonly details?: unknown;
  readonly status: number;

  constructor(status: number, body: ApiError) {
    super(body.message);
    this.name = 'MarketApiError';
    this.code = body.code;
    this.status = status;
    if (body.details !== undefined) this.details = body.details;
  }
}

async function parse<T>(res: Response): Promise<T> {
  const text = await res.text();
  const json: unknown = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const err = (json as { error?: ApiError } | null)?.error ?? {
      code: 'UNKNOWN',
      message: `HTTP ${res.status}`,
    };
    throw new MarketApiError(res.status, err);
  }
  return json as T;
}

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
  const init: RequestInit = { cache: 'no-store' };
  if (opts.signal) init.signal = opts.signal;
  const res = await fetch(`/api/market/price?${params.toString()}`, init);
  const body = await parse<{ ticks: Tick[] }>(res);
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
  const init: RequestInit = { cache: 'no-store' };
  if (opts.signal) init.signal = opts.signal;
  const res = await fetch(`/api/market/candles?${params.toString()}`, init);
  const body = await parse<{ symbol: Symbol; tf: Timeframe; candles: Candle[] }>(res);
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
  const init: RequestInit = {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      symbol,
      tf,
      count,
      indicators: indicators.map((i) => ({ kind: i.kind, params: i.params ?? {} })),
    }),
  };
  if (opts.signal) init.signal = opts.signal;
  const res = await fetch('/api/market/indicators', init);
  const body = await parse<{ results: IndicatorResult[] }>(res);
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
  const init: RequestInit = {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      symbol,
      tf,
      count,
      indicators: indicators.map((i) => ({ kind: i.kind, params: i.params ?? {} })),
    }),
  };
  if (opts.signal) init.signal = opts.signal;
  const res = await fetch('/api/market/indicators', init);
  return parse<ChartDataResponse>(res);
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
  const init: RequestInit = {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      symbol,
      tf,
      count: opts.count ?? 300,
      ...(opts.kinds ? { kinds: opts.kinds } : {}),
      lookback: opts.lookback ?? 3,
    }),
  };
  if (opts.signal) init.signal = opts.signal;
  const res = await fetch('/api/market/structure', init);
  return parse<StructureResult>(res);
}
