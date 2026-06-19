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

// Tool: get_seasonality.
//
// Per-month / per-weekday / per-hour return distributions. Daily candles
// for month + weekday (last 3 yrs); 1H candles for the hour-of-day view
// (last ~90d). Buckets carry median, IQR, and win rate so the chat part
// renders trader-grade numbers instead of "January is bullish".

import { getCandles } from '@hamafx/data';
import {
  GetSeasonalityInputSchema,
  type GetSeasonalityOutput,
  type SeasonalityBucket,
  type SeasonalityGranularity,
} from '@hamafx/shared';
import { tool } from 'ai';
import type { z } from 'zod';

const InputSchema = GetSeasonalityInputSchema;

declare module '@hamafx/shared' {
  interface ToolIOMap {
    get_seasonality: { input: z.infer<typeof InputSchema> };
  }
}

const MONTH_LABELS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;
const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

export const getSeasonalityTool = tool({
  description:
    "Per-month / per-weekday / per-hour return seasonality for a symbol. Returns median percent return, IQR, win rate, and sample count per bucket. Use for 'is January typically strong for gold', 'what's the best weekday for EURUSD', 'when does GBPUSD usually trend during the day'. Sets `thin: true` when fewer than 30 samples per bucket are available.",
  inputSchema: InputSchema,
  execute: async ({ symbol, granularity }): Promise<GetSeasonalityOutput> => {
    const tf = granularity === 'hour' ? '1h' : '1d';
    const count = granularity === 'hour' ? 2160 : 1100; // ~90d on 1H, ~3yrs on 1D.

    let candles: { c: number; t: number }[] = [];
    try {
      candles = await getCandles(symbol, tf, { count });
    } catch {
      return {
        symbol,
        granularity,
        asOf: Date.now(),
        buckets: [],
        sampleSize: 0,
        thin: true,
      };
    }

    const samples = closeToCloseSamples(candles, granularity);
    const buckets = bucketize(samples, granularity);

    const minSamplesPerBucket = buckets.reduce(
      (acc, b) => Math.min(acc, b.count),
      Number.POSITIVE_INFINITY,
    );
    const thin = !Number.isFinite(minSamplesPerBucket) || minSamplesPerBucket < 30;

    return {
      symbol,
      granularity,
      asOf: Date.now(),
      buckets,
      sampleSize: samples.length,
      thin,
    };
  },
});

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

interface Sample {
  /** Bucket key derived from the bar's timestamp. */
  bucket: number;
  /** Percent return vs the previous bar. */
  pct: number;
}

function closeToCloseSamples(
  candles: { c: number; t: number }[],
  granularity: SeasonalityGranularity,
): Sample[] {
  const out: Sample[] = [];
  for (let i = 1; i < candles.length; i += 1) {
    const prev = candles[i - 1]!;
    const curr = candles[i]!;
    if (prev.c <= 0) continue;
    const pct = ((curr.c - prev.c) / prev.c) * 100;
    if (!Number.isFinite(pct)) continue;
    out.push({ bucket: bucketKey(curr.t, granularity), pct });
  }
  return out;
}

function bucketize(samples: Sample[], g: SeasonalityGranularity): SeasonalityBucket[] {
  const groups = new Map<number, number[]>();
  for (const k of keysFor(g)) groups.set(k, []);

  for (const s of samples) {
    const arr = groups.get(s.bucket);
    if (arr) arr.push(s.pct);
  }

  return [...groups.entries()].map(([k, list]) => {
    const sorted = [...list].sort((a, b) => a - b);
    const median = quantile(sorted, 0.5) ?? 0;
    const q1 = quantile(sorted, 0.25) ?? 0;
    const q3 = quantile(sorted, 0.75) ?? 0;
    const wins = list.filter((x) => x > 0).length;
    return {
      key: k,
      label: labelFor(g, k),
      count: list.length,
      medianReturnPct: median,
      q1Pct: q1,
      q3Pct: q3,
      winRate: list.length === 0 ? 0 : wins / list.length,
    };
  });
}

function keysFor(g: SeasonalityGranularity): number[] {
  if (g === 'month') return Array.from({ length: 12 }, (_, i) => i + 1);
  if (g === 'weekday') return Array.from({ length: 7 }, (_, i) => i);
  return Array.from({ length: 24 }, (_, i) => i);
}

function bucketKey(ms: number, g: SeasonalityGranularity): number {
  const d = new Date(ms);
  if (g === 'month') return d.getUTCMonth() + 1;
  if (g === 'weekday') return d.getUTCDay();
  return d.getUTCHours();
}

function labelFor(g: SeasonalityGranularity, k: number): string {
  if (g === 'month') return MONTH_LABELS[k - 1] ?? String(k);
  if (g === 'weekday') return WEEKDAY_LABELS[k] ?? String(k);
  return `${String(k).padStart(2, '0')}:00 UTC`;
}

function quantile(sorted: number[], q: number): number | null {
  if (sorted.length === 0) return null;
  const idx = (sorted.length - 1) * q;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo] ?? null;
  const a = sorted[lo]!;
  const b = sorted[hi]!;
  return a + (b - a) * (idx - lo);
}
