// Asian-session range extraction.
//
// The Asian session is conventionally 00:00–07:00 UTC. We extract the
// high/low of the bars whose bar-start time falls in that window for the
// current UTC day relative to the latest bar. If the latest bar is itself
// before 07:00 UTC, the range is "still forming" and we use bars seen so
// far. If the window for today has no bars at all (weekend), we fall back
// to the most recent UTC day that does.

import type { Candle } from '@hamafx/shared';

const ASIAN_START_HOUR_UTC = 0;
const ASIAN_END_HOUR_UTC = 7;

export interface AsianRange {
  /** YYYY-MM-DD UTC. */
  date: string;
  high: number;
  low: number;
  /** ms epoch UTC bounds of the actual bars used. */
  fromTime: number;
  toTime: number;
  /** True if `now` is still inside the Asian session (range may extend further). */
  forming: boolean;
}

export function computeAsianRange(candles: Candle[]): AsianRange | null {
  if (candles.length === 0) return null;

  // Walk distinct UTC days backwards from the latest bar; pick the first
  // day that has at least one bar inside the Asian window.
  const days = collectDistinctDays(candles);

  for (let i = days.length - 1; i >= 0; i -= 1) {
    const day = days[i]!;
    const bars = candles.filter((c) => utcDayKey(c.t) === day && inAsianWindow(c.t));
    if (bars.length === 0) continue;

    let high = Number.NEGATIVE_INFINITY;
    let low = Number.POSITIVE_INFINITY;
    let fromTime = bars[0]!.t;
    let toTime = bars[0]!.t;
    for (const b of bars) {
      if (b.h > high) high = b.h;
      if (b.l < low) low = b.l;
      if (b.t < fromTime) fromTime = b.t;
      if (b.t > toTime) toTime = b.t;
    }

    const latest = candles[candles.length - 1]!;
    const forming = utcDayKey(latest.t) === day && inAsianWindow(latest.t);

    return { date: day, high, low, fromTime, toTime, forming };
  }
  return null;
}

function utcDayKey(ms: number): string {
  const d = new Date(ms);
  const yyyy = d.getUTCFullYear().toString().padStart(4, '0');
  const mm = (d.getUTCMonth() + 1).toString().padStart(2, '0');
  const dd = d.getUTCDate().toString().padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function inAsianWindow(ms: number): boolean {
  const h = new Date(ms).getUTCHours();
  return h >= ASIAN_START_HOUR_UTC && h < ASIAN_END_HOUR_UTC;
}

function collectDistinctDays(candles: Candle[]): string[] {
  const days: string[] = [];
  let last = '';
  for (const c of candles) {
    const k = utcDayKey(c.t);
    if (k !== last) {
      days.push(k);
      last = k;
    }
  }
  return days;
}
