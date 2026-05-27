// Tool: get_intermarket.
//
// Cross-asset pulse: USD-strength proxy (50/50 EUR/GBP), gold 24h pulse,
// and the XAU↔DXY-proxy correlation in the requested window. Regime is
// derived deterministically from the signs and magnitudes; `regimeBreak`
// flags when the correlation has flipped sign (the pair is *typically*
// strongly negative — the dollar up = gold down).

import { getCandles } from '@hamafx/data';
import {
  GetIntermarketInputSchema,
  type GetIntermarketOutput,
  type RiskRegime,
  type Symbol,
} from '@hamafx/shared';
import { tool } from 'ai';
import type { z } from 'zod';

const InputSchema = GetIntermarketInputSchema;

declare module '@hamafx/shared' {
  interface ToolIOMap {
    get_intermarket: { input: z.infer<typeof InputSchema> };
  }
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const DXY_FORMULA =
  'DXY proxy = 100 / (EURUSD^0.5 * GBPUSD^0.5). Two-leg approximation; not a true DXY.';

export const getIntermarketTool = tool({
  description:
    "Cross-asset pulse: USD-strength proxy + 24h change, gold's 24h percent change, and XAU↔DXY-proxy correlation in the chosen window. Flags `regimeBreak` when the typical XAU↔DXY anti-correlation has flipped. Use for any 'what's the dollar doing', 'is gold tracking the dollar today', or 'risk on or off' prompt — captures the macro pulse the agent needs to stop guessing.",
  inputSchema: InputSchema,
  execute: async ({ tf, windowBars }): Promise<GetIntermarketOutput> => {
    const need = windowBars + 1;
    const series = new Map<Symbol, BareReturns>();
    let partial = false;

    for (const symbol of ['XAUUSD', 'EURUSD', 'GBPUSD'] as const) {
      try {
        const bars = await getCandles(symbol, tf, { count: need });
        series.set(symbol, bareReturns(bars));
      } catch {
        partial = true;
      }
    }

    const xau = series.get('XAUUSD');
    const eur = series.get('EURUSD');
    const gbp = series.get('GBPUSD');

    const dxyProxy = computeDxyProxy(eur, gbp);
    const goldChange24h = computeChange24h(xau);
    const xauDxyCorrelation = computeXauDxyCorrelation(xau, eur, gbp, windowBars);

    const regime = inferRegime({ dxy24h: dxyProxy.change24h, goldChange24h });
    const regimeBreak = xauDxyCorrelation > 0;

    const notes = buildNotes({
      dxy24h: dxyProxy.change24h,
      goldChange24h,
      xauDxyCorrelation,
      regime,
      regimeBreak,
    });

    return {
      asOf: Date.now(),
      tf,
      windowBars,
      dxyProxy,
      goldChange24h,
      xauDxyCorrelation,
      regime,
      regimeBreak,
      notes,
      partial,
    };
  },
});

// ---------------------------------------------------------------------------
// math
// ---------------------------------------------------------------------------

interface BareReturns {
  closes: number[];
  returns: number[];
  times: number[];
}

function bareReturns(bars: { c: number; t: number }[]): BareReturns {
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
  if (den === 0 || !Number.isFinite(den)) return 0;
  const r = num / den;
  return Math.max(-1, Math.min(1, r));
}

function computeDxyProxy(
  eur: BareReturns | undefined,
  gbp: BareReturns | undefined,
): GetIntermarketOutput['dxyProxy'] {
  if (!eur || !gbp || eur.closes.length === 0 || gbp.closes.length === 0) {
    return { value: 0, change24h: 0, formula: DXY_FORMULA };
  }
  const lastEur = eur.closes[eur.closes.length - 1]!;
  const lastGbp = gbp.closes[gbp.closes.length - 1]!;
  const value = 100 / (Math.pow(lastEur, 0.5) * Math.pow(lastGbp, 0.5));

  const lastTime = eur.times[eur.times.length - 1] ?? Date.now();
  const eurAtTarget = closestPrice(eur, lastTime - ONE_DAY_MS);
  const gbpAtTarget = closestPrice(gbp, lastTime - ONE_DAY_MS);
  let change24h = 0;
  if (eurAtTarget !== null && gbpAtTarget !== null) {
    const past = 100 / (Math.pow(eurAtTarget, 0.5) * Math.pow(gbpAtTarget, 0.5));
    if (past > 0) change24h = ((value - past) / past) * 100;
  }
  return { value, change24h, formula: DXY_FORMULA };
}

function computeChange24h(s: BareReturns | undefined): number | null {
  if (!s || s.closes.length === 0) return null;
  const lastTime = s.times[s.times.length - 1] ?? Date.now();
  const past = closestPrice(s, lastTime - ONE_DAY_MS);
  if (past === null || past <= 0) return null;
  const lastClose = s.closes[s.closes.length - 1]!;
  return ((lastClose - past) / past) * 100;
}

function computeXauDxyCorrelation(
  xau: BareReturns | undefined,
  eur: BareReturns | undefined,
  gbp: BareReturns | undefined,
  windowBars: number,
): number {
  if (!xau || !eur || !gbp) return 0;
  const n = Math.min(xau.returns.length, eur.returns.length, gbp.returns.length, windowBars);
  if (n < 5) return 0;
  // Synth DXY return at bar i ≈ -(0.5 * eur_return + 0.5 * gbp_return).
  const dxyReturns: number[] = [];
  for (let i = 0; i < n; i += 1) {
    const eurR = eur.returns[eur.returns.length - n + i]!;
    const gbpR = gbp.returns[gbp.returns.length - n + i]!;
    dxyReturns.push(-(0.5 * eurR + 0.5 * gbpR));
  }
  const xauReturns = xau.returns.slice(-n);
  return pearson(xauReturns, dxyReturns);
}

function closestPrice(s: BareReturns, targetMs: number): number | null {
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

// ---------------------------------------------------------------------------
// regime + notes
// ---------------------------------------------------------------------------

function inferRegime(args: {
  dxy24h: number;
  goldChange24h: number | null;
}): RiskRegime {
  const dxyDir = sign(args.dxy24h, 0.1);
  const goldDir = args.goldChange24h !== null ? sign(args.goldChange24h, 0.2) : 0;
  if (dxyDir < 0 && goldDir > 0) return 'risk-on';
  if (dxyDir > 0 && goldDir < 0) return 'risk-off';
  return 'neutral';
}

function sign(n: number, threshold: number): number {
  if (n > threshold) return 1;
  if (n < -threshold) return -1;
  return 0;
}

function buildNotes(args: {
  dxy24h: number;
  goldChange24h: number | null;
  xauDxyCorrelation: number;
  regime: RiskRegime;
  regimeBreak: boolean;
}): string {
  const regimeLine =
    args.regime === 'risk-on'
      ? 'Dollar offered, gold bid — risk-on tone.'
      : args.regime === 'risk-off'
        ? 'Dollar bid, gold offered — risk-off tone.'
        : 'Mixed signals — neutral macro pulse.';
  const corrLine =
    args.xauDxyCorrelation <= -0.4
      ? 'XAU and DXY are tracking their typical anti-correlation.'
      : args.xauDxyCorrelation >= 0.4
        ? 'XAU and DXY are moving together — atypical, treat with caution.'
        : 'XAU/DXY relationship is loose this window.';
  const breakLine = args.regimeBreak ? ' Regime-break flag is on.' : '';
  return `${regimeLine} ${corrLine}${breakLine}`;
}
