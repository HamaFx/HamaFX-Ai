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

// BiQuote (https://biquote.io) wire-format schemas.
//
// BiQuote is a free, no-key REST + SignalR market-data service. We adopt it
// as the primary price + 1m-candle source in Phase 8. These schemas mirror
// BiQuote's response shapes verbatim — the provider adapter
// (packages/data/src/providers/biquote/map.ts) maps them to our internal
// Tick / Candle DTOs.
//
// References:
//   - https://biquote.io/docs#models
//   - https://biquote.io/docs#ticks
//   - https://biquote.io/docs#ohlc
//   - https://biquote.io/docs#websocket
//
// Tolerance: BiQuote's wire format may grow extra fields (e.g. additional
// telemetry on tick payloads). Schemas are deliberately permissive on extras
// (zod's default `passthrough` discarded — we strip unknowns) but strict on
// the fields we depend on.

import { z } from 'zod';

/**
 * BiQuote tick payload — REST `GET /api/{symbol}` response.
 *
 * The REST shape evolved from earlier docs:
 *   - `time` is a dot-separated local-format string ("2026.05.27 22:09:20"),
 *     NOT ISO. Don't `Date.parse` it. The `timestamp` field carries the
 *     ISO-8601 UTC value we actually want.
 *   - `source` is a free-form string like "MetaTrader 5 (Broker 1)" — not
 *     the older 'MT5'|'MTX' enum.
 *   - `last` is `0.0` for FX (BiQuote intentionally suppresses last-traded
 *     price for spot markets); use `mid` for downstream consumers.
 *   - `direction` is a string ('UP'|'DOWN'|'FLAT'), not a number.
 *
 * Permissive on extras so a future server-side schema tweak doesn't drop
 * every tick.
 */
export const BiquoteTickSchema = z.object({
  symbol: z.string().min(1),
  bid: z.number().finite(),
  ask: z.number().finite(),
  /**
   * Mid price. BiQuote computes this server-side, so callers should
   * prefer `mid` over `last` (which is 0 for FX) or the bid/ask average.
   * Optional — not in BiQuote's official documented tick schema, so we
   * compute a fallback (bid+ask)/2 when missing. (BUG-3 fix)
   */
  mid: z.number().finite().optional(),
  /** Last traded price. 0 for FX (suppressed by BiQuote). */
  last: z.number().finite(),
  volume: z.number().finite(),
  /** ISO-8601 UTC. */
  timestamp: z.string().min(1),
  /** Free-form source label. */
  source: z.string().min(1),
  high: z.number().finite().nullable().optional(),
  low: z.number().finite().nullable().optional(),
  direction: z.union([z.string(), z.number(), z.null()]).optional(),
  dayDiffPercent: z.number().finite().nullable().optional(),
  description: z.string().nullable().optional(),
  /** Dot-separated local-format time string. NOT parseable by Date.parse. */
  time: z.string().optional(),
  spread: z.number().finite().nullable().optional(),
});

export type BiquoteTick = z.infer<typeof BiquoteTickSchema>;

/**
 * BiQuote SignalR `ReceiveTick` push payload. Differs from the REST
 * shape:
 *   - `timestamp` (ms epoch number), not `time` (ISO string).
 *   - `source` is a numeric enum (0/1), not a string.
 *   - `type` field is absent; the server stops sending it on the hot path.
 *   - extra fields (`high`, `low`, `direction`, `dayDiffPercent`,
 *     `description`) are forwarded but optional from our point of view.
 *
 * We map both shapes into the same internal `NormalizedTick` shape in
 * the consumer.
 */
export const BiquoteSignalRTickSchema = z.object({
  symbol: z.string().min(1),
  bid: z.number().finite(),
  ask: z.number().finite(),
  last: z.number().finite(),
  volume: z.number().finite(),
  /**
   * Per BiQuote's wire format, the SignalR push timestamp is either
   * milliseconds since epoch (number) or an ISO string. Accept both so
   * a future server-side change doesn't trip the consumer.
   */
  timestamp: z.union([z.number().int().nonnegative(), z.string().min(1)]),
  /** Numeric enum or string — accept either. */
  source: z.union([z.number().int(), z.string().min(1)]),
  // Extras BiQuote forwards. We accept anything that's a finite number /
  // string / null / missing — the consumer never reads them, but failing
  // to validate them would drop every tick.
  high: z.number().finite().nullable().optional(),
  low: z.number().finite().nullable().optional(),
  /** Direction is sometimes a number (1, 0, -1), sometimes a string. */
  direction: z.union([z.number(), z.string(), z.null()]).optional(),
  dayDiffPercent: z.number().finite().nullable().optional(),
  description: z.string().nullable().optional(),
});

export type BiquoteSignalRTick = z.infer<typeof BiquoteSignalRTickSchema>;

/**
 * BiQuote OHLC bar — `GET /api/{symbol}/ohlc?tf=&limit=` response item.
 *
 * `volume` is real volume (0 for FX). `tickVolume` is the count of ticks
 * that produced the bar, which we surface as a non-null integer everywhere
 * (FX feeds always have ≥1 tick or the bar wouldn't exist).
 *
 * `isOpen` is `true` for the live unfinished bar at the head of the array.
 * The provider adapter drops it before mapping to our `Candle` DTO unless
 * the caller explicitly opts into open bars.
 */
export const BiquoteOhlcBarSchema = z.object({
  /** ISO-8601 UTC timestamp at bar open. */
  openTime: z.string().min(1),
  open: z.number().finite(),
  high: z.number().finite(),
  low: z.number().finite(),
  close: z.number().finite(),
  volume: z.number().int().nonnegative(),
  tickVolume: z.number().int().nonnegative(),
  isOpen: z.boolean(),
});

export type BiquoteOhlcBar = z.infer<typeof BiquoteOhlcBarSchema>;

/**
 * BiQuote symbol metadata — `GET /api/symbols` response item, also returned
 * by `/api/symbols/search` and `/api/symbols/{name}`.
 *
 * We don't currently consume this in production — it's here so the symbol
 * filter in the BiQuote adapter can sanity-check that BiQuote still supports
 * a symbol before we attempt to subscribe. Phase 8 only ever queries our
 * three internal symbols, so the runtime cost is negligible.
 */
export const BiquoteSymbolSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  type: z.string().min(1),
  exchange: z.string().min(1),
  source: z.string().min(1),
});

export type BiquoteSymbol = z.infer<typeof BiquoteSymbolSchema>;

/** Convenience: the supported timeframe codes BiQuote accepts on `/ohlc`. */
export const BiquoteTimeframeSchema = z.enum([
  '1m',
  '5m',
  '15m',
  '30m',
  '1h',
  '4h',
  '1d',
]);

export type BiquoteTimeframe = z.infer<typeof BiquoteTimeframeSchema>;
