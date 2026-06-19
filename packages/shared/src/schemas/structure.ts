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

// Smart Money Concepts (SMC) market-structure events.
//
// Unlike continuous indicators (RSI, EMA, ...), SMC outputs are SPARSE
// EVENTS scattered across a candle window: a swing here, a fair-value gap
// there, an order block on bar 47. Forcing them into the per-candle
// `IndicatorResult.values` array would be 95% nulls — so they get their
// own schemas and live in a separate result envelope.
//
// All event indices reference positions in the candle array the request
// was computed against. The chart UI uses these to draw overlays.

import { z } from 'zod';

import { SymbolSchema } from '../symbols';
import { TimeframeSchema } from '../timeframes';

// ---------------------------------------------------------------------------
// Swing points — local pivot highs / lows. Foundation for BOS / CHoCH.
// ---------------------------------------------------------------------------

export const SwingTypeSchema = z.enum(['high', 'low']);
export type SwingType = z.infer<typeof SwingTypeSchema>;

export const SwingPointSchema = z.object({
  /** Index into the candle window. */
  index: z.number().int().min(0),
  /** Open time of the bar at `index`, ms epoch UTC. */
  time: z.number().int(),
  /** The pivot price — high for swing-high, low for swing-low. */
  price: z.number(),
  type: SwingTypeSchema,
  /** Lookback used to qualify the pivot (k bars on each side). */
  lookback: z.number().int().positive(),
});
export type SwingPoint = z.infer<typeof SwingPointSchema>;

// ---------------------------------------------------------------------------
// BOS (Break Of Structure) — break of last swing in trend direction.
// CHoCH (Change of Character) — break against the prevailing trend.
// Both emit an "event" at the candle where the break confirmed.
// ---------------------------------------------------------------------------

export const StructureEventKindSchema = z.enum(['bos', 'choch']);
export type StructureEventKind = z.infer<typeof StructureEventKindSchema>;

export const StructureDirectionSchema = z.enum(['bullish', 'bearish']);
export type StructureDirection = z.infer<typeof StructureDirectionSchema>;

export const StructureEventSchema = z.object({
  kind: StructureEventKindSchema,
  direction: StructureDirectionSchema,
  /** Candle index where the break confirmed (close beyond `level`). */
  brokenAt: z.number().int().min(0),
  /** ms epoch UTC of `brokenAt`. */
  time: z.number().int(),
  /** The swing-point price that was broken. */
  level: z.number(),
  /** Index of the swing-point in the source `swings` array. */
  swingIndex: z.number().int().min(0),
});
export type StructureEvent = z.infer<typeof StructureEventSchema>;

// ---------------------------------------------------------------------------
// FVG — Fair Value Gap (a.k.a. 3-bar imbalance).
// Bullish: low[i+2] > high[i] (gap on the way up; price often retraces here)
// Bearish: high[i+2] < low[i]
// ---------------------------------------------------------------------------

export const FvgZoneSchema = z.object({
  side: StructureDirectionSchema,
  /** Index of the FIRST bar in the 3-bar pattern. */
  startIndex: z.number().int().min(0),
  /** Index of the THIRD bar (where the gap was confirmed). */
  endIndex: z.number().int().min(0),
  startTime: z.number().int(),
  endTime: z.number().int(),
  /** Top of the gap (always > bottom). */
  top: z.number(),
  bottom: z.number(),
  /**
   * True if a later bar's wick touched the zone — useful UI hint to dim
   * already-mitigated FVGs.
   */
  mitigated: z.boolean(),
  /** 0–1: how much of the gap has been retraced. 1.0 = fully mitigated. */
  percentFilled: z.number().min(0).max(1).optional(),
});
export type FvgZone = z.infer<typeof FvgZoneSchema>;

// ---------------------------------------------------------------------------
// Order block — last opposite-color candle before a confirmed impulse.
// Bullish OB: last red bar before a sequence of green bars that broke a
// recent swing high. Bearish OB: symmetric.
// ---------------------------------------------------------------------------

export const OrderBlockSchema = z.object({
  side: StructureDirectionSchema,
  /** Index of the OB candle itself. */
  index: z.number().int().min(0),
  time: z.number().int(),
  /** Top/bottom = high/low of the OB candle. */
  top: z.number(),
  bottom: z.number(),
  /** True once a later candle wicked into the zone. */
  mitigated: z.boolean(),
  /** Strength 0–1 based on impulse magnitude / ATR, bar count, trend alignment. */
  strength: z.number().min(0).max(1).optional(),
});
export type OrderBlock = z.infer<typeof OrderBlockSchema>;

// ---------------------------------------------------------------------------
// Liquidity sweep — wick spike beyond a recent swing that closes back inside.
// Marks where stops likely got hit; common reversal trigger.
// ---------------------------------------------------------------------------

export const LiquiditySweepSchema = z.object({
  /** "high" = wick swept a swing-high (stops above); "low" = swept a swing-low. */
  side: SwingTypeSchema,
  /** Candle index of the sweeping bar. */
  index: z.number().int().min(0),
  time: z.number().int(),
  /** The swing level that was swept. */
  level: z.number(),
  /** The actual extreme (wick) that swept the level. */
  wick: z.number(),
  /** Wick extension beyond the level as a multiple of ATR(14). Higher = stronger sweep. */
  magnitude: z.number().min(0).optional(),
});
export type LiquiditySweep = z.infer<typeof LiquiditySweepSchema>;

// ---------------------------------------------------------------------------
// StructureResult — combined envelope returned by /api/market/structure
// and the `get_market_structure` AI tool. All sub-arrays are optional so
// callers can request only the kinds they care about.
// ---------------------------------------------------------------------------

export const StructureKindSchema = z.enum([
  'swings',
  'bos_choch',
  'fvg',
  'order_blocks',
  'liquidity',
]);
export type StructureKind = z.infer<typeof StructureKindSchema>;

export const StructureResultSchema = z.object({
  symbol: SymbolSchema,
  tf: TimeframeSchema,
  /** Number of candles the result was computed against. */
  bars: z.number().int().nonnegative(),
  swings: z.array(SwingPointSchema).optional(),
  events: z.array(StructureEventSchema).optional(),
  fvg: z.array(FvgZoneSchema).optional(),
  orderBlocks: z.array(OrderBlockSchema).optional(),
  liquidity: z.array(LiquiditySweepSchema).optional(),
  fetchedAt: z.number().int(),
});
export type StructureResult = z.infer<typeof StructureResultSchema>;
