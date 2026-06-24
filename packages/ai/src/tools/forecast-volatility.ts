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

// Tool: forecast_volatility.
//
// ATR-based forward-vol estimate over a `(symbol, tf, horizonHours)` window
// with an optional event multiplier when one or more high-impact macro
// events land inside the window. The expected move scales linearly with
// the number of bars covered:
//
//   barsInHorizon  = horizonHours * 60 / barMinutes
//   expectedPips   = atr_pips * sqrt(barsInHorizon) * eventMultiplier

import { getCandles, getPrice } from '@hamafx/data';
import { getDb, schema } from '@hamafx/db';
import { atr } from '@hamafx/indicators';
import {
  ForecastVolatilityInputSchema,
  pipSize,
  type EventCurrency,
  type ForecastVolatilityOutput,
  type Symbol,
  type Timeframe,
} from '@hamafx/shared';
import { tool } from 'ai';
import { and, asc, gte, inArray, lte } from 'drizzle-orm';
import type { z } from 'zod';

const InputSchema = ForecastVolatilityInputSchema;

declare module '@hamafx/shared' {
  interface ToolIOMap {
    forecast_volatility: { input: z.infer<typeof InputSchema> };
  }
}

const BAR_MS: Record<Timeframe, number> = {
  '1m': 60_000,
  '5m': 5 * 60_000,
  '15m': 15 * 60_000,
  '30m': 30 * 60_000,
  '1h': 60 * 60_000,
  '4h': 4 * 60 * 60_000,
  '1d': 24 * 60 * 60_000,
  '1w': 7 * 24 * 60 * 60_000,
};

const CURRENCIES_BY_SYMBOL: Record<Symbol, EventCurrency[]> = {
  XAUUSD: ['USD'],
  EURUSD: ['EUR', 'USD'],
  GBPUSD: ['GBP', 'USD'],
};

export const forecastVolatilityTool = tool({
  description:
    'ATR-based forward-vol estimate for a (symbol, horizonHours) window. Returns the expected move in pips, a projected price range from the live mid, and an event multiplier when a high-impact macro event lands inside the window. Use for "expected range over next N hours", "how much could it move ahead of CPI", or sizing decisions for time-bound trades.',
  inputSchema: InputSchema,
  execute: async ({ symbol, tf, horizonHours }): Promise<ForecastVolatilityOutput> => {
    const candles = await getCandles(symbol, tf, { count: 200 });
    const baselineCandles = await getCandles(symbol, '1d', { count: 60 }).catch(() => []);
    const pip = pipSize(symbol);
    const now = Date.now();

    const atrSeries = atr(candles, 14);
    const lastAtr = lastFiniteNumber(atrSeries);
    const atrPips = lastAtr !== null ? lastAtr / pip : 0;

    const baselineAtrSeries = baselineCandles.length >= 30 ? atr(baselineCandles, 14) : [];
    const baselineLast = baselineAtrSeries.length > 0 ? lastFiniteNumber(baselineAtrSeries) : null;
    const atrPipsBaseline30d =
      baselineLast !== null ? baselineLast / pipSize(symbol) : null;

    // High-impact events inside the horizon window.
    const events = await listHighImpactEventsInWindow({
      currencies: CURRENCIES_BY_SYMBOL[symbol] || ['USD'],
      fromMs: now,
      toMs: now + horizonHours * 60 * 60 * 1000,
    });
    const eventCount = events.length;
    const eventMultiplier = eventCount >= 2 ? 2 : eventCount === 1 ? 1.5 : 1;
    const eventAdjusted = eventCount > 0;

    const barsInHorizon = (horizonHours * 60 * 60 * 1000) / BAR_MS[tf];
    const expectedMovePips = atrPips * Math.sqrt(Math.max(barsInHorizon, 0)) * eventMultiplier;

    let expectedRange: ForecastVolatilityOutput['expectedRange'] = null;
    try {
      const tick = await getPrice(symbol);
      const offset = expectedMovePips * pip;
      expectedRange = {
        low: tick.mid - offset,
        high: tick.mid + offset,
        mid: tick.mid,
      };
    } catch {
      // Mid unavailable — leave null.
    }

    const next = events[0];
    const nextHighImpact: ForecastVolatilityOutput['nextHighImpact'] = next
      ? {
          title: next.title,
          whenIso: new Date(next.date).toISOString(),
          currency: next.currency,
        }
      : null;

    const notes = buildNotes({
      symbol,
      tf,
      horizonHours,
      atrPips,
      expectedMovePips,
      eventAdjusted,
      eventCount,
      atrPipsBaseline30d,
    });

    return {
      symbol,
      tf,
      horizonHours,
      asOf: now,
      atrPips,
      atrPipsBaseline30d,
      expectedMovePips,
      expectedRange,
      eventAdjusted,
      eventMultiplier,
      nextHighImpact,
      notes,
    };
  },
});

interface EventLookupArgs {
  currencies: EventCurrency[];
  fromMs: number;
  toMs: number;
}

interface EventRow {
  title: string;
  currency: string | null;
  date: number;
}

async function listHighImpactEventsInWindow(args: EventLookupArgs): Promise<EventRow[]> {
  const rows = await getDb()
    .select()
    .from(schema.economicEvents)
    .where(
      and(
        inArray(schema.economicEvents.currency, args.currencies as string[]),
        gte(schema.economicEvents.date, new Date(args.fromMs)),
        lte(schema.economicEvents.date, new Date(args.toMs)),
        inArray(schema.economicEvents.importance, ['high']),
      ),
    )
    .orderBy(asc(schema.economicEvents.date))
    .limit(10);
  return rows.map((r) => ({
    title: r.title,
    currency: r.currency,
    date: r.date.getTime(),
  }));
}

function lastFiniteNumber(values: readonly (number | null)[]): number | null {
  for (let i = values.length - 1; i >= 0; i -= 1) {
    const v = values[i];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
  }
  return null;
}

function buildNotes(args: {
  symbol: Symbol;
  tf: Timeframe;
  horizonHours: number;
  atrPips: number;
  expectedMovePips: number;
  eventAdjusted: boolean;
  eventCount: number;
  atrPipsBaseline30d: number | null;
}): string {
  const baselineLine =
    args.atrPipsBaseline30d !== null
      ? args.atrPips > args.atrPipsBaseline30d * 1.25
        ? ' Realized vol is elevated vs the 30-day baseline.'
        : args.atrPips < args.atrPipsBaseline30d * 0.8
          ? ' Realized vol is muted vs the 30-day baseline.'
          : ''
      : '';
  const eventLine = args.eventAdjusted
    ? ` ${args.eventCount} high-impact event${args.eventCount === 1 ? '' : 's'} in the window — multiplier applied.`
    : '';
  return `${args.symbol} ${args.tf} ATR(14) is ${args.atrPips.toFixed(1)} pips; expected ±${args.expectedMovePips.toFixed(1)} pips over the next ${args.horizonHours}h.${eventLine}${baselineLine}`;
}
