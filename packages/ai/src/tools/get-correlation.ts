// Tool: get_correlation.
//
// Returns a Pearson correlation matrix over close-to-close returns for
// all pairs of supported symbols at a given timeframe + window, plus a
// derived USD-strength proxy ("DXY proxy") computed from the FX legs.
//
// The proxy is **not** a true DXY (no JPY, CAD, SEK, CHF) — we only have
// EURUSD and GBPUSD. The formula is captured verbatim in
// `dxyProxy.formula` so any agent answer that quotes the value can also
// quote the formula, and the UI labels the value as a proxy clearly.

import { getCandles } from '@hamafx/data';
import {
  GetCorrelationInputSchema,
  SYMBOLS,
  type CorrelationCell,
  type GetCorrelationOutput,
  type Symbol,
  type Timeframe,
} from '@hamafx/shared';
import { tool } from 'ai';
import type { z } from 'zod';

const InputSchema = GetCorrelationInputSchema;

declare module '@hamafx/shared' {
  interface ToolIOMap {
    get_correlation: { input: z.infer<typeof InputSchema> };
  }
}

const FX_PAIRS_FOR_DXY: Array<{ symbol: Symbol; weight: number }> = [
  { symbol: 'EURUSD', weight: 0.5 },
  { symbol: 'GBPUSD', weight: 0.5 },
];

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export const getCorrelationTool = tool({
  description:
    "Pearson correlation matrix over close-to-close returns for XAUUSD/EURUSD/GBPUSD at the given timeframe + window, plus a USD-strength proxy ('DXY proxy') computed from EURUSD and GBPUSD with 50/50 weights. Use for any 'are EUR and GBP both selling off' / 'how correlated is gold to the dollar' / 'what's the dollar doing today' prompt. Returns the formula verbatim so you can cite it.",
  inputSchema: InputSchema,
  execute: async ({ tf, windowBars }): Promise<GetCorrelationOutput> => {
    const need = windowBars + 1;
    const candlesBySymbol = new Map<Symbol, ReturnType<typeof bareReturns>>();
    for (const symbol of SYMBOLS) {
      try {
        const bars = await getCandles(symbol, tf, { count: need });
        candlesBySymbol.set(symbol, bareReturns(bars));
      } catch {
        // Per-symbol failure tolerated; skip the matrix entry below.
      }
    }

    const matrix: CorrelationCell[] = [];
    for (let i = 0; i < SYMBOLS.length; i += 1) {
      for (let j = i + 1; j < SYMBOLS.length; j += 1) {
        const a = SYMBOLS[i]!;
        const b = SYMBOLS[j]!;
        const ra = candlesBySymbol.get(a);
        const rb = candlesBySymbol.get(b);
        if (!ra || !rb || ra.returns.length < windowBars || rb.returns.length < windowBars) continue;
        const r = pearson(ra.returns.slice(-windowBars), rb.returns.slice(-windowBars));
        matrix.push({ a, b, r: clampUnit(r) });
      }
    }

    return {
      tf,
      windowBars,
      asOf: Date.now(),
      matrix,
      dxyProxy: computeDxyProxy(candlesBySymbol, tf, windowBars),
    };
  },
});

// ---------------------------------------------------------------------------
// Returns / Pearson
// ---------------------------------------------------------------------------

interface SymbolReturns {
  /** Closes oldest-first; same length as the input candle window. */
  closes: number[];
  /** Close-to-close log returns, length = closes.length - 1. */
  returns: number[];
  /** Bar timestamps (ms epoch UTC), aligned to `closes`. */
  times: number[];
}

function bareReturns(bars: { c: number; t: number }[]): SymbolReturns {
  const closes: number[] = [];
  const times: number[] = [];
  for (const b of bars) {
    if (Number.isFinite(b.c)) {
      closes.push(b.c);
      times.push(b.t);
    }
  }
  const returns: number[] = [];
  for (let i = 1; i < closes.length; i += 1) {
    const prev = closes[i - 1]!;
    const curr = closes[i]!;
    if (prev > 0) returns.push(Math.log(curr / prev));
  }
  return { closes, returns, times };
}

function pearson(xs: number[], ys: number[]): number {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return 0;
  let sx = 0;
  let sy = 0;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i += 1) {
    const x = xs[i]!;
    const y = ys[i]!;
    sx += x;
    sy += y;
    sxy += x * y;
    sxx += x * x;
    syy += y * y;
  }
  const num = n * sxy - sx * sy;
  const denomX = n * sxx - sx * sx;
  const denomY = n * syy - sy * sy;
  const den = Math.sqrt(denomX * denomY);
  return den === 0 ? 0 : num / den;
}

function clampUnit(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.max(-1, Math.min(1, x));
}

// ---------------------------------------------------------------------------
// DXY proxy
// ---------------------------------------------------------------------------

function computeDxyProxy(
  data: Map<Symbol, SymbolReturns>,
  tf: Timeframe,
  windowBars: number,
): GetCorrelationOutput['dxyProxy'] {
  const eur = data.get('EURUSD');
  const gbp = data.get('GBPUSD');

  const formula =
    'DXY proxy = 100 / (EURUSD^0.5 * GBPUSD^0.5). Two-leg approximation; not a true DXY (no JPY/CAD/SEK/CHF).';

  if (!eur || !gbp || eur.closes.length === 0 || gbp.closes.length === 0) {
    return { value: 0, change24h: 0, samples: 0, formula };
  }

  const lastEur = eur.closes[eur.closes.length - 1]!;
  const lastGbp = gbp.closes[gbp.closes.length - 1]!;
  const value = 100 / (Math.pow(lastEur, 0.5) * Math.pow(lastGbp, 0.5));

  // 24h change — find the bar closest to 24h before the last bar.
  const lastTime = eur.times[eur.times.length - 1] ?? Date.now();
  const targetTime = lastTime - ONE_DAY_MS;
  const eurAtTarget = closestPrice(eur, targetTime);
  const gbpAtTarget = closestPrice(gbp, targetTime);

  let change24h = 0;
  if (eurAtTarget !== null && gbpAtTarget !== null) {
    const past = 100 / (Math.pow(eurAtTarget, 0.5) * Math.pow(gbpAtTarget, 0.5));
    if (past > 0) change24h = ((value - past) / past) * 100;
  }

  void tf;
  void windowBars;
  return {
    value,
    change24h,
    samples: Math.min(eur.closes.length, gbp.closes.length),
    formula,
  };
}

function closestPrice(s: SymbolReturns, targetMs: number): number | null {
  if (s.times.length === 0) return null;
  let bestIdx = 0;
  let bestDiff = Math.abs(s.times[0]! - targetMs);
  for (let i = 1; i < s.times.length; i += 1) {
    const d = Math.abs(s.times[i]! - targetMs);
    if (d < bestDiff) {
      bestDiff = d;
      bestIdx = i;
    }
  }
  return s.closes[bestIdx] ?? null;
}
