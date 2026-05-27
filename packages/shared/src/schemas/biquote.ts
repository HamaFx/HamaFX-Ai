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
 * BiQuote tick payload — REST `GET /api/{symbol}` response and SignalR
 * `ReceiveTick` event share this shape.
 *
 * `time` is ISO-8601 UTC. `volume` is 0 for FX (BiQuote-side, not us).
 * `source` discriminates which upstream feed BiQuote used: `MT5` is their
 * MetaTrader 5 bridge, `MTX` is their Matriks feed.
 */
export const BiquoteTickSchema = z.object({
  symbol: z.string().min(1),
  description: z.string().nullable().optional(),
  bid: z.number().finite(),
  ask: z.number().finite(),
  /** Last traded price. May equal mid for FX. */
  last: z.number().finite(),
  volume: z.number().finite(),
  /** ISO-8601 UTC timestamp. */
  time: z.string().min(1),
  source: z.enum(['MT5', 'MTX']),
  type: z.string().min(1),
});

export type BiquoteTick = z.infer<typeof BiquoteTickSchema>;

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
  'M1',
  'M5',
  'M15',
  'M30',
  'H1',
  'H4',
  'D1',
]);

export type BiquoteTimeframe = z.infer<typeof BiquoteTimeframeSchema>;
