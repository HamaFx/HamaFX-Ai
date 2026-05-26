// Tool: analyze_technical.
//
// Composite read of trend, bias, momentum, structure, and key levels per
// timeframe. Equivalent to issuing get_candles + get_indicators +
// get_market_structure for each timeframe and projecting the result, but
// in one round-trip with a deterministic summary string. No second LLM
// call inside the tool.
//
// Per-timeframe failures (e.g. quota exceeded on Twelve Data for one tf)
// are tolerated — the failing tf is dropped from the result and the
// `partial` flag flips so the chat part can surface a warning.

import { getCandles } from '@hamafx/data';
import { computeIndicator } from '@hamafx/indicators';
import { computeStructure } from '@hamafx/indicators';
import {
  AnalyzeTechnicalInputSchema,
  priceDecimals,
  type AnalyzeTechnicalOutput,
  type Candle,
  type IndicatorResult,
  type PerTimeframeReading,
  type StructureResult,
  type Symbol,
  type Timeframe,
} from '@hamafx/shared';
import { tool } from 'ai';
import type { z } from 'zod';

const InputSchema = AnalyzeTechnicalInputSchema;

declare module '@hamafx/shared' {
  interface ToolIOMap {
    analyze_technical: { input: z.infer<typeof InputSchema> };
  }
}

/** Number of bars to scan for each per-tf computation. */
const COUNT = 200;

declare module '@hamafx/shared' {
  // (re-declared to keep the per-file `ToolIOMap` augmentation pattern)
}

export const analyzeTechnicalTool = tool({
  description:
    'Multi-timeframe technical readout (trend, bias, momentum, structure, levels) for a symbol. Use for any "top-down" / "what does this look like across timeframes" prompt — replaces 8+ atomic tool calls with one deterministic projection. Returns per-timeframe readings plus a templated one-paragraph summary; sets `partial: true` if a fetch failed for any requested timeframe.',
  inputSchema: InputSchema,
  execute: async ({ symbol, timeframes }): Promise<AnalyzeTechnicalOutput> => {
    const readings = await Promise.all(timeframes.map((tf) => readOneTimeframe(symbol, tf)));
    const perTimeframe = readings.filter((r): r is PerTimeframeReading => r !== null);
    const partial = perTimeframe.length < timeframes.length;
    return {
      symbol,
      asOf: Date.now(),
      perTimeframe,
      summary: deterministicSummary({ symbol, perTimeframe, partial }),
      partial,
    };
  },
});

// ---------------------------------------------------------------------------
// Per-timeframe orchestrator
// ---------------------------------------------------------------------------

async function readOneTimeframe(
  symbol: Symbol,
  tf: Timeframe,
): Promise<PerTimeframeReading | null> {
  try {
    const candles = await getCandles(symbol, tf, { count: COUNT });
    if (candles.length === 0) return null;

    const ema50 = computeIndicator({ symbol, tf, kind: 'ema', params: { period: 50 }, candles });
    const ema200 = computeIndicator({ symbol, tf, kind: 'ema', params: { period: 200 }, candles });
    const rsi = computeIndicator({ symbol, tf, kind: 'rsi', params: { period: 14 }, candles });
    const macd = computeIndicator({
      symbol,
      tf,
      kind: 'macd',
      params: { fast: 12, slow: 26, signal: 9 },
      candles,
    });
    const atr = computeIndicator({ symbol, tf, kind: 'atr', params: { period: 14 }, candles });
    const pivots = computeIndicator({ symbol, tf, kind: 'pivots', params: {}, candles });

    const structure = computeStructure({
      symbol,
      tf,
      candles,
      kinds: ['swings', 'bos_choch'],
      swings: { lookback: 3 },
    });

    return projectReading({
      symbol,
      tf,
      candles,
      ema50,
      ema200,
      rsi,
      macd,
      atr,
      pivots,
      structure,
    });
  } catch (err) {
    // Best-effort: surface the failure in the response, never bubble.
    console.warn(`[analyze_technical] ${symbol} ${tf} failed`, err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Projection — collapse arrays to the typed reading shape
// ---------------------------------------------------------------------------

interface ProjectArgs {
  symbol: Symbol;
  tf: Timeframe;
  candles: Candle[];
  ema50: IndicatorResult;
  ema200: IndicatorResult;
  rsi: IndicatorResult;
  macd: IndicatorResult;
  atr: IndicatorResult;
  pivots: IndicatorResult;
  structure: StructureResult;
}

function projectReading(args: ProjectArgs): PerTimeframeReading {
  const close = args.candles[args.candles.length - 1]!.c;
  const ema50Last = lastNumber(args.ema50);
  const ema200Last = lastNumber(args.ema200);
  const rsi14 = lastNumber(args.rsi) ?? 50;
  const macdHist = lastFromObject(args.macd, 'hist') ?? 0;
  const atr14 = lastNumber(args.atr);
  const pv = lastFromObject(args.pivots, 'pp');
  const r1 = lastFromObject(args.pivots, 'r1');
  const s1 = lastFromObject(args.pivots, 's1');

  const trend: PerTimeframeReading['trend'] =
    ema50Last !== null && ema200Last !== null
      ? close > ema50Last && ema50Last > ema200Last
        ? 'up'
        : close < ema50Last && ema50Last < ema200Last
          ? 'down'
          : 'range'
      : 'range';

  // Bias overlay: trend wins, RSI nudges into bullish/bearish/neutral.
  const bias: PerTimeframeReading['bias'] =
    trend === 'up' && rsi14 >= 45
      ? 'bullish'
      : trend === 'down' && rsi14 <= 55
        ? 'bearish'
        : trend === 'range' && rsi14 >= 60
          ? 'bullish'
          : trend === 'range' && rsi14 <= 40
            ? 'bearish'
            : 'neutral';

  const swings = args.structure.swings ?? [];
  const recentHigh =
    [...swings].reverse().find((s) => s.type === 'high')?.price ?? null;
  const recentLow =
    [...swings].reverse().find((s) => s.type === 'low')?.price ?? null;

  const lastEvent = args.structure.events?.at(-1);
  const latestStructureEvent: PerTimeframeReading['structure']['latestStructureEvent'] = lastEvent
    ? lastEvent.kind === 'bos'
      ? lastEvent.direction === 'bullish'
        ? 'BOS_up'
        : 'BOS_down'
      : lastEvent.direction === 'bullish'
        ? 'CHoCH_up'
        : 'CHoCH_down'
    : null;

  return {
    tf: args.tf,
    trend,
    bias,
    momentum: { rsi14, macdHist },
    structure: {
      swingHigh: recentHigh,
      swingLow: recentLow,
      latestStructureEvent,
    },
    levels: { pivot: pv, r1, s1, atr14 },
  };
}

function lastNumber(ind: IndicatorResult): number | null {
  for (let i = ind.values.length - 1; i >= 0; i -= 1) {
    const v = ind.values[i];
    if (typeof v === 'number') return v;
  }
  return null;
}

function lastFromObject(ind: IndicatorResult, key: string): number | null {
  for (let i = ind.values.length - 1; i >= 0; i -= 1) {
    const v = ind.values[i];
    if (
      v !== null &&
      typeof v === 'object' &&
      key in v &&
      typeof (v as Record<string, number | null>)[key] === 'number'
    ) {
      return (v as Record<string, number>)[key]!;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Templated summary
// ---------------------------------------------------------------------------

function deterministicSummary(args: {
  symbol: Symbol;
  perTimeframe: PerTimeframeReading[];
  partial: boolean;
}): string {
  if (args.perTimeframe.length === 0) {
    return args.partial ? 'No timeframes available — all fetches failed.' : 'Empty.';
  }

  const decimals = priceDecimals(args.symbol);
  const head = args.perTimeframe.map((r) => `${r.tf}=${r.trend}/${r.bias}`).join(' · ');
  const lastEvent = [...args.perTimeframe]
    .reverse()
    .find((r) => r.structure.latestStructureEvent !== null);
  const evt = lastEvent
    ? ` Latest structure: ${lastEvent.structure.latestStructureEvent} on ${lastEvent.tf}.`
    : '';

  const atrLine = args.perTimeframe
    .filter((r) => r.levels.atr14 !== null)
    .map((r) => `${r.tf} ATR ${r.levels.atr14!.toFixed(decimals)}`)
    .join(', ');

  const partialNote = args.partial ? ' (partial — some timeframes were unavailable).' : '';
  return `${args.symbol}: ${head}.${evt}${atrLine ? ` Volatility: ${atrLine}.` : ''}${partialNote}`;
}
