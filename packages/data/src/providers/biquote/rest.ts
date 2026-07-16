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

// BiQuote REST client. Thin wrapper around `fetch` that:
//   1. Resolves the base URL (default https://biquote.io, override via env).
//   2. Times out after `signal`/default 8 s.
//   3. Coerces non-2xx + BiQuote's `{ message }` error envelopes into
//      ProviderError.
//   4. Returns wire-shape objects validated against the schemas in
//      @hamafx/shared/schemas/biquote — DTO mapping happens in the adapter.
//
// Endpoints:
//   - GET /api/{symbol}                — latest tick
//   - GET /api/latest?symbols=A,B,C    — batch ticks
//   - GET /api/{symbol}/ohlc?...       — OHLC candles
//
// Reference: https://biquote.io/docs

import {
  BiquoteOhlcBarSchema,
  BiquoteTickSchema,
  type BiquoteOhlcBar,
  type BiquoteTick,
} from '@hamafx/shared';
import type { Symbol, Timeframe } from '@hamafx/shared';
import { z } from 'zod';

import { noteBackoff, tryReserve, type ThrottleConfig } from '../../cache/throttle';
import { ProviderError } from '../../errors';
import { assertSupportedSymbol } from './filter';
import { toBiquoteSymbol, toBiquoteTimeframe } from './map';

const PROVIDER = 'biquote';
const DEFAULT_BASE_URL = 'https://biquote.io';
const DEFAULT_TIMEOUT_MS = 8_000;

/**
 * Self-throttle config. BiQuote is unauthenticated and doesn't publish a
 * fair-use cap; we cap REST traffic at 50/min total across all symbols.
 * The persistent SignalR connection (Phase 8 PR-6) is a single
 * long-lived TCP socket and is NOT counted here. (BUG-4 fix: comment
 * now matches the actual throttle limit of 50/min.)
 *
 * On 429, the adaptive throttle drops the cap to 80% of `limit` for
 * `cooloffMs` (90 s default), then auto-recovers.
 */
const THROTTLE: ThrottleConfig = { limit: 50, windowMs: 60_000 };

const ErrorEnvelopeSchema = z.object({
  message: z.string(),
});

const LatestArraySchema = z.array(BiquoteTickSchema);
/** OHLC response is `{ symbol, interval, bars: [...] }` (was: flat array). */
const OhlcEnvelopeSchema = z.object({
  symbol: z.string().min(1),
  interval: z.string().min(1),
  bars: z.array(BiquoteOhlcBarSchema),
});

interface CallOptions {
  signal?: AbortSignal;
  /** Override the base URL (used by tests). Defaults to `https://biquote.io`. */
  baseUrl?: string;
  /** Skip the in-memory throttle reservation (used by tests). */
  skipThrottle?: boolean;
}

function resolveBaseUrl(opts: CallOptions): string {
  return opts.baseUrl ?? process.env.BIQUOTE_BASE_URL ?? DEFAULT_BASE_URL;
}

async function call<T>(
  path: string,
  query: Record<string, string> | null,
  schema: z.ZodSchema<T>,
  opts: CallOptions,
): Promise<T> {
  if (!opts.skipThrottle && !(await tryReserve(PROVIDER, THROTTLE))) {
    throw new ProviderError(
      'PROVIDER_QUOTA_EXCEEDED',
      PROVIDER,
      `Self-throttle: capped at ${THROTTLE.limit} req / ${THROTTLE.windowMs}ms`,
    );
  }

  const url = new URL(path, resolveBaseUrl(opts));
  if (query) {
    for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(new Error('timeout')), DEFAULT_TIMEOUT_MS);
  if (opts.signal) {
    if (opts.signal.aborted) ctrl.abort(opts.signal.reason);
    else opts.signal.addEventListener('abort', () => ctrl.abort(opts.signal!.reason), { once: true });
  }

  let res: Response;
  try {
    res = await fetch(url, { signal: ctrl.signal, cache: 'no-store' });
  } catch (cause) {
    clearTimeout(timer);
    const isAbort = (cause as Error)?.name === 'AbortError';
    throw new ProviderError(
      isAbort ? 'PROVIDER_TIMEOUT' : 'PROVIDER_HTTP_ERROR',
      PROVIDER,
      isAbort ? 'request timed out' : 'fetch failed',
      { cause },
    );
  }
  clearTimeout(timer);

  if (!res.ok) {
    if (res.status === 429) await noteBackoff(PROVIDER, THROTTLE);

    // BiQuote responds with `{ "message": "..." }` on 4xx. Surface the
    // human-readable message when present; fall back to the status text.
    let message = `HTTP ${res.status} ${res.statusText}`;
    try {
      const json: unknown = await res.json();
      const env = ErrorEnvelopeSchema.safeParse(json);
      if (env.success) message = env.data.message;
    } catch {
      /* body not JSON or empty — use the status-text fallback */
    }

    throw new ProviderError(
      res.status === 429 ? 'PROVIDER_QUOTA_EXCEEDED' : 'PROVIDER_HTTP_ERROR',
      PROVIDER,
      message,
      { status: res.status },
    );
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch (cause) {
    throw new ProviderError('PROVIDER_PARSE_ERROR', PROVIDER, 'invalid JSON', { cause });
  }

  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    throw new ProviderError(
      'PROVIDER_PARSE_ERROR',
      PROVIDER,
      `unexpected response shape: ${parsed.error.issues
        .map((i) => i.path.join('.'))
        .slice(0, 3)
        .join(', ')}`,
      { cause: parsed.error },
    );
  }
  return parsed.data;
}

// ---------------------------------------------------------------------------
// Tick (single + batch)
// ---------------------------------------------------------------------------

/** Latest tick for a single symbol. */
export async function fetchTick(symbol: Symbol, opts: CallOptions = {}): Promise<BiquoteTick> {
  const validated = assertSupportedSymbol(symbol);
  return call(`/api/${toBiquoteSymbol(validated)}`, null, BiquoteTickSchema, opts);
}

/**
 * Latest ticks for multiple symbols in one HTTP round trip.
 * `GET /api/latest?symbols=XAUUSD,EURUSD,GBPUSD` returns an array; symbols
 * BiQuote can't quote at the moment are silently omitted (missing rather
 * than error rows).
 */
export async function fetchLatest(
  symbols: Symbol[],
  opts: CallOptions = {},
): Promise<BiquoteTick[]> {
  if (symbols.length === 0) return [];
  // Validate every input before issuing the request.
  for (const s of symbols) assertSupportedSymbol(s);
  const csv = symbols.map(toBiquoteSymbol).join(',');
  return call('/api/latest', { symbols: csv }, LatestArraySchema, opts);
}

// ---------------------------------------------------------------------------
// OHLC candles
// ---------------------------------------------------------------------------

export interface FetchOhlcArgs extends CallOptions {
  symbol: Symbol;
  tf: Timeframe;
  /** Bar count, capped at BiQuote's documented 1000-per-series limit. (BUG-1 fix: was 2000) */
  count: number;
  /**
   * If false (default), drop the live unfinished bar (`isOpen=true`). The
   * worker's 1m aggregator wants this so it never persists a half-formed
   * bar; the chart route handler also wants this. Set to `true` only when
   * the caller explicitly wants the head bar (e.g. for "live last close").
   */
  includeOpenBar?: boolean;
}

/**
 * Fetch up to `count` recent OHLC bars from BiQuote.
 *
 * Throws ProviderError on:
 *   - Unsupported timeframe (W1) — BiQuote doesn't expose weekly.
 *   - Quota / HTTP failure / parse error.
 *   - Empty array (treated as "no data" so failover can move on).
 *
 * Returns oldest-first bars.
 */
export async function fetchOhlc(args: FetchOhlcArgs): Promise<BiquoteOhlcBar[]> {
  const validated = assertSupportedSymbol(args.symbol);
  const tf = toBiquoteTimeframe(args.tf);
  if (tf === null) {
    throw new ProviderError(
      'PROVIDER_HTTP_ERROR',
      PROVIDER,
      `unsupported timeframe "${args.tf}" — biquote does not provide weekly bars`,
    );
  }

  const limit = Math.max(1, Math.min(args.count, 1000)); // BUG-1 fix: was 2000, BiQuote max is 1000
  const path = `/api/${toBiquoteSymbol(validated)}/ohlc`;
  const env = await call(path, { interval: tf, limit: String(limit) }, OhlcEnvelopeSchema, args);
  const raw = env.bars;

  // BiQuote currently returns bars NEWEST-first; flip to oldest-first
  // for downstream consumers (indicators, charts) that expect that order.
  // Also drop the in-progress bar unless the caller asked to keep it.
  const ascending = [...raw].reverse();
  const filtered = args.includeOpenBar ? ascending : ascending.filter((b) => !b.isOpen);
  if (filtered.length === 0) {
    throw new ProviderError('PROVIDER_HTTP_ERROR', PROVIDER, 'empty candle response');
  }

  // Final monotonicity guard — if BiQuote ever flips ordering again,
  // surface it loudly instead of shipping mixed-order bars to indicators.
  for (let i = 1; i < filtered.length; i += 1) {
    if (Date.parse(filtered[i]!.openTime) < Date.parse(filtered[i - 1]!.openTime)) {
      throw new ProviderError(
        'PROVIDER_PARSE_ERROR',
        PROVIDER,
        'OHLC bars are not in ascending-time order — upstream contract changed',
      );
    }
  }

  return filtered;
}
