// Previous-day high / low extraction.
//
// Walks the candle window and finds the high and low of the most-recent
// COMPLETE UTC day relative to the latest bar. Returns null when the
// window doesn't span a full prior day.
//
// "Previous day" = the UTC day that ended before the latest bar's UTC day.
// On a Monday morning (UTC), PDH/PDL refers to last Friday's session
// because Saturday and Sunday have no bars; we follow the data, not the
// calendar.

import type { Candle } from '@hamafx/shared';

export interface PdhPdl {
  /** Date string of the previous day (YYYY-MM-DD UTC). */
  date: string;
  high: number;
  low: number;
  /** ms epoch UTC of the bar where the high was set. */
  highTime: number;
  /** ms epoch UTC of the bar where the low was set. */
  lowTime: number;
}

export function computePdhPdl(candles: Candle[]): PdhPdl | null {
  if (candles.length === 0) return null;

  // Build a list of distinct UTC day-keys present in the window, in order.
  const dayKeys: string[] = [];
  let lastKey = '';
  for (const c of candles) {
    const k = utcDayKey(c.t);
    if (k !== lastKey) {
      dayKeys.push(k);
      lastKey = k;
    }
  }
  if (dayKeys.length < 2) return null; // need a complete previous day

  const previousDay = dayKeys[dayKeys.length - 2]!;

  let high = Number.NEGATIVE_INFINITY;
  let low = Number.POSITIVE_INFINITY;
  let highTime = 0;
  let lowTime = 0;
  for (const c of candles) {
    if (utcDayKey(c.t) !== previousDay) continue;
    if (c.h > high) {
      high = c.h;
      highTime = c.t;
    }
    if (c.l < low) {
      low = c.l;
      lowTime = c.t;
    }
  }
  if (!Number.isFinite(high) || !Number.isFinite(low)) return null;

  return { date: previousDay, high, low, highTime, lowTime };
}

function utcDayKey(ms: number): string {
  const d = new Date(ms);
  const yyyy = d.getUTCFullYear().toString().padStart(4, '0');
  const mm = (d.getUTCMonth() + 1).toString().padStart(2, '0');
  const dd = d.getUTCDate().toString().padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}
