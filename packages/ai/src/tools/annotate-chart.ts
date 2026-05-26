// Tool: annotate_chart.
//
// Computes SMC + session-level annotations for a (symbol, tf, count) window
// and emits an OverlaySet — markers + price lines — that the chart UI's
// existing renderer accepts directly. The deep link in the chat part
// reuses these primitives via `?overlays=...` URL state.
//
// The palette is hard-coded (matches the chart's CSS-token defaults) so
// the tool runs in any environment without reading the DOM. Lightweight
// charts is happy with hex strings; deeper theme integration can come
// later.

import { getCandles } from '@hamafx/data';
import {
  computeAsianRange,
  computePdhPdl,
  computeStructure,
} from '@hamafx/indicators';
import {
  AnnotateChartInputSchema,
  type AnnotateChartKind,
  type AnnotateChartOutput,
  type Candle,
  type ChartMarker,
  type ChartPriceLine,
} from '@hamafx/shared';
import { tool } from 'ai';
import type { z } from 'zod';

const InputSchema = AnnotateChartInputSchema;

declare module '@hamafx/shared' {
  interface ToolIOMap {
    annotate_chart: { input: z.infer<typeof InputSchema> };
  }
}

/**
 * Hex equivalents of the design tokens. Kept in sync with
 * `apps/web/src/app/globals.css` — recompute via the OKLCH fallback
 * only if those tokens change.
 */
const PALETTE = {
  bull: '#48d597',
  bear: '#f0594a',
  warn: '#f5b945',
  muted: '#8a93a3',
  info: '#5fb1f5',
} as const;

void PALETTE;

export const annotateChartTool = tool({
  description:
    "Compute chart annotations (swings, BOS/CHoCH, FVG, order blocks, liquidity sweeps, previous-day high/low, Asian session range) for a symbol/timeframe and return them as the OverlaySet the chart UI consumes. Use when the user asks to 'mark', 'show', or 'annotate' something on the chart. Output's `markers` and `priceLines` arrays plug straight into lightweight-charts; the chat part renders a one-line summary plus a deep link with the chosen overlays pre-toggled.",
  inputSchema: InputSchema,
  execute: async ({ symbol, tf, kinds, lookback, count }): Promise<AnnotateChartOutput> => {
    const candles = await getCandles(symbol, tf, { count });

    const markers: ChartMarker[] = [];
    const priceLines: ChartPriceLine[] = [];
    const counts: Partial<Record<AnnotateChartKind, number>> = {};
    const want = new Set<AnnotateChartKind>(kinds);

    // SMC kinds — share one structure compute call.
    const smcKinds = (
      ['swings', 'bos_choch', 'fvg', 'order_blocks', 'liquidity'] as AnnotateChartKind[]
    ).filter((k) => want.has(k));
    if (smcKinds.length > 0) {
      const r = computeStructure({
        symbol,
        tf,
        candles,
        kinds: smcKinds.map(toStructureKind),
        swings: { lookback },
      });

      if (want.has('swings') && r.swings) {
        for (const s of r.swings) {
          const t = bartime(candles, s.index);
          if (t === null) continue;
          markers.push({
            time: t,
            position: s.type === 'high' ? 'aboveBar' : 'belowBar',
            color: PALETTE.muted,
            shape: s.type === 'high' ? 'arrowDown' : 'arrowUp',
            text: '',
            size: 1,
          });
        }
        counts.swings = r.swings.length;
      }

      if (want.has('bos_choch') && r.events) {
        for (const e of r.events) {
          const t = bartime(candles, e.brokenAt);
          if (t === null) continue;
          const color = e.direction === 'bullish' ? PALETTE.bull : PALETTE.bear;
          const tag = e.kind.toUpperCase();
          markers.push({
            time: t,
            position: e.direction === 'bullish' ? 'belowBar' : 'aboveBar',
            color,
            shape: e.direction === 'bullish' ? 'arrowUp' : 'arrowDown',
            text: tag,
            size: 2,
          });
          priceLines.push({
            price: e.level,
            color,
            lineWidth: 1,
            lineStyle: e.kind === 'choch' ? 2 : 0,
            axisLabelVisible: true,
            title: `${tag} ${e.direction === 'bullish' ? '↑' : '↓'}`,
          });
        }
        counts.bos_choch = r.events.length;
      }

      if (want.has('fvg') && r.fvg) {
        const open = r.fvg.filter((z) => !z.mitigated);
        for (const z of open) {
          const t = bartime(candles, z.startIndex);
          if (t === null) continue;
          const color = z.side === 'bullish' ? PALETTE.bull : PALETTE.bear;
          const mid = (z.top + z.bottom) / 2;
          markers.push({
            time: t,
            position: z.side === 'bullish' ? 'belowBar' : 'aboveBar',
            color,
            shape: 'square',
            text: 'FVG',
            size: 1,
          });
          priceLines.push({
            price: mid,
            color,
            lineWidth: 1,
            lineStyle: 1,
            axisLabelVisible: true,
            title: `FVG ${z.bottom.toFixed(2)}-${z.top.toFixed(2)}`,
          });
        }
        counts.fvg = open.length;
      }

      if (want.has('order_blocks') && r.orderBlocks) {
        const open = r.orderBlocks.filter((o) => !o.mitigated);
        for (const ob of open) {
          const t = bartime(candles, ob.index);
          if (t === null) continue;
          const color = ob.side === 'bullish' ? PALETTE.bull : PALETTE.bear;
          const mid = (ob.top + ob.bottom) / 2;
          markers.push({
            time: t,
            position: ob.side === 'bullish' ? 'belowBar' : 'aboveBar',
            color,
            shape: 'square',
            text: 'OB',
            size: 1,
          });
          priceLines.push({
            price: mid,
            color,
            lineWidth: 1,
            lineStyle: 1,
            axisLabelVisible: true,
            title: `OB ${ob.bottom.toFixed(2)}-${ob.top.toFixed(2)}`,
          });
        }
        counts.order_blocks = open.length;
      }

      if (want.has('liquidity') && r.liquidity) {
        for (const lq of r.liquidity) {
          const t = bartime(candles, lq.index);
          if (t === null) continue;
          markers.push({
            time: t,
            position: lq.side === 'high' ? 'aboveBar' : 'belowBar',
            color: PALETTE.warn,
            shape: 'circle',
            text: '✶',
            size: 1,
          });
        }
        counts.liquidity = r.liquidity.length;
      }
    }

    if (want.has('pdh_pdl')) {
      const pd = computePdhPdl(candles);
      if (pd) {
        priceLines.push({
          price: pd.high,
          color: PALETTE.info,
          lineWidth: 1,
          lineStyle: 2,
          axisLabelVisible: true,
          title: `PDH ${pd.high.toFixed(2)}`,
        });
        priceLines.push({
          price: pd.low,
          color: PALETTE.info,
          lineWidth: 1,
          lineStyle: 2,
          axisLabelVisible: true,
          title: `PDL ${pd.low.toFixed(2)}`,
        });
        counts.pdh_pdl = 2;
      }
    }

    if (want.has('asian_range')) {
      const ar = computeAsianRange(candles);
      if (ar) {
        priceLines.push({
          price: ar.high,
          color: PALETTE.warn,
          lineWidth: 1,
          lineStyle: 3,
          axisLabelVisible: true,
          title: `Asia H ${ar.high.toFixed(2)}${ar.forming ? ' (forming)' : ''}`,
        });
        priceLines.push({
          price: ar.low,
          color: PALETTE.warn,
          lineWidth: 1,
          lineStyle: 3,
          axisLabelVisible: true,
          title: `Asia L ${ar.low.toFixed(2)}${ar.forming ? ' (forming)' : ''}`,
        });
        counts.asian_range = 2;
      }
    }

    // lightweight-charts requires markers in chronological order.
    markers.sort((a, b) => a.time - b.time);

    // Materialize the counts object so missing kinds show as 0.
    const countsByKind: Record<AnnotateChartKind, number> = {
      swings: counts.swings ?? 0,
      bos_choch: counts.bos_choch ?? 0,
      fvg: counts.fvg ?? 0,
      order_blocks: counts.order_blocks ?? 0,
      liquidity: counts.liquidity ?? 0,
      pdh_pdl: counts.pdh_pdl ?? 0,
      asian_range: counts.asian_range ?? 0,
    };

    return {
      symbol,
      tf,
      asOf: Date.now(),
      markers,
      priceLines,
      countsByKind,
    };
  },
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convert a candle index to a lightweight-charts UTC seconds timestamp. */
function bartime(candles: Candle[], i: number): number | null {
  const c = candles[i];
  if (!c) return null;
  return Math.floor(c.t / 1000);
}

/**
 * Map our `AnnotateChartKind` to the `StructureKind` the SMC orchestrator
 * understands. PDH/PDL and Asian-range aren't structure-module concepts.
 */
function toStructureKind(k: AnnotateChartKind): 'swings' | 'bos_choch' | 'fvg' | 'order_blocks' | 'liquidity' {
  if (k === 'pdh_pdl' || k === 'asian_range') {
    throw new Error(`toStructureKind: ${k} is not a structure kind`);
  }
  return k;
}
