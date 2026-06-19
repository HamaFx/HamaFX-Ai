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

// Translates a StructureResult into the marker / price-line primitives
// that lightweight-charts can render natively.
//
// Phase-2 scope: swings, BOS/CHoCH, liquidity sweeps render as markers
// + (for BOS/CHoCH) one labelled price line at the broken level. FVG and
// OB ZONES are deferred to a follow-up PR — proper rectangle rendering
// needs lightweight-charts custom primitives, which adds 100+ lines of
// canvas-painting code that's better isolated. Until then we still render
// FVG midpoint markers so the user knows where they are.

import type { StructureResult } from '@hamafx/shared';
import type * as LightweightCharts from 'lightweight-charts';

type UTCTimestamp = LightweightCharts.UTCTimestamp;

export interface MarkerPrimitive {
  time: UTCTimestamp;
  position: 'aboveBar' | 'belowBar' | 'inBar';
  color: string;
  shape: 'arrowUp' | 'arrowDown' | 'circle' | 'square';
  text: string;
  /** String-encoded integer 0–4 (Vertex AI rejects numeric literal enums). */
  size: string | number;
}

export interface PriceLinePrimitive {
  price: number;
  color: string;
  /** String-encoded 1–4 (Vertex AI compat). */
  lineWidth: string | number;
  /** String-encoded 0–4 (Solid, Dotted, Dashed, LargeDashed, SparseDotted). */
  lineStyle: string | number;
  axisLabelVisible: boolean;
  title: string;
}

export interface OverlaySet {
  markers: MarkerPrimitive[];
  priceLines: PriceLinePrimitive[];
}

export interface OverlayPalette {
  bull: string;
  bear: string;
  warn: string;
  muted: string;
}

export interface OverlayToggles {
  swings: boolean;
  bos_choch: boolean;
  fvg: boolean;
  order_blocks: boolean;
  liquidity: boolean;
}

const ALL_ON: OverlayToggles = {
  swings: true,
  bos_choch: true,
  fvg: true,
  order_blocks: true,
  liquidity: true,
};

/**
 * Build markers + price lines from a StructureResult. The candle window the
 * SMC was computed against is required because event indices are positions
 * in that array — we need the matching `candles[i].t` to map to chart time.
 */
export function buildOverlays(
  result: StructureResult,
  candleTimes: number[],
  palette: OverlayPalette,
  toggles: OverlayToggles = ALL_ON,
): OverlaySet {
  const markers: MarkerPrimitive[] = [];
  const priceLines: PriceLinePrimitive[] = [];

  const timeAt = (i: number): UTCTimestamp | null => {
    const t = candleTimes[i];
    if (t === undefined) return null;
    return Math.floor(t / 1000) as UTCTimestamp;
  };

  // Swings — small triangles above (highs) / below (lows) bars.
  if (toggles.swings && result.swings) {
    for (const s of result.swings) {
      const t = timeAt(s.index);
      if (t === null) continue;
      markers.push({
        time: t,
        position: s.type === 'high' ? 'aboveBar' : 'belowBar',
        color: palette.muted,
        shape: s.type === 'high' ? 'arrowDown' : 'arrowUp',
        text: '',
        size: 1,
      });
    }
  }

  // BOS / CHoCH — marker at the break bar + a labelled price line at the
  // broken level so the user can see exactly what was taken out.
  if (toggles.bos_choch && result.events) {
    for (const e of result.events) {
      const t = timeAt(e.brokenAt);
      if (t === null) continue;
      const color = e.direction === 'bullish' ? palette.bull : palette.bear;
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
        lineStyle: e.kind === 'choch' ? 2 : 0, // dashed for CHoCH so it stands out
        axisLabelVisible: true,
        title: `${tag} ${e.direction === 'bullish' ? '↑' : '↓'} ${e.level}`,
      });
    }
  }

  // Liquidity sweeps — small circle at the wick end.
  if (toggles.liquidity && result.liquidity) {
    for (const lq of result.liquidity) {
      const t = timeAt(lq.index);
      if (t === null) continue;
      markers.push({
        time: t,
        position: lq.side === 'high' ? 'aboveBar' : 'belowBar',
        color: palette.warn,
        shape: 'circle',
        text: '✶',
        size: 1,
      });
    }
  }

  // FVG — until rectangle primitives land, render a small square at the
  // first bar of the gap and a price line at the gap MIDPOINT (only for
  // unmitigated zones — mitigated FVGs add noise without much value).
  if (toggles.fvg && result.fvg) {
    for (const z of result.fvg) {
      if (z.mitigated) continue;
      const t = timeAt(z.startIndex);
      if (t === null) continue;
      const mid = (z.top + z.bottom) / 2;
      const color = z.side === 'bullish' ? palette.bull : palette.bear;
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
        lineStyle: 1, // dotted — distinguishes from BOS/CHoCH solid lines
        axisLabelVisible: true,
        title: `FVG ${z.bottom}-${z.top}`,
      });
    }
  }

  // Order blocks — same pattern as FVG: marker + dotted line at midpoint.
  if (toggles.order_blocks && result.orderBlocks) {
    for (const ob of result.orderBlocks) {
      if (ob.mitigated) continue;
      const t = timeAt(ob.index);
      if (t === null) continue;
      const mid = (ob.top + ob.bottom) / 2;
      const color = ob.side === 'bullish' ? palette.bull : palette.bear;
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
        title: `OB ${ob.bottom}-${ob.top}`,
      });
    }
  }

  // Markers must be sorted by time for lightweight-charts.
  markers.sort((a, b) => Number(a.time) - Number(b.time));
  return { markers, priceLines };
}
