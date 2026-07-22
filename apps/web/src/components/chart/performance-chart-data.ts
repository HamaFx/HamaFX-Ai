// SPDX-License-Identifier: Apache-2.0

import type { JournalEntry } from '@hamafx/shared';
import type { UTCTimestamp } from 'lightweight-charts';

export interface EquityPoint {
  time: UTCTimestamp;
  value: number;
}

export interface EquityCurve {
  data: EquityPoint[];
  totalR: number;
}

/**
 * Build a cumulative R-multiple equity curve from closed journal entries.
 * Points are ordered chronologically by trade open time. Duplicate timestamps
 * are de-duplicated by incrementing the later point's time by one second so
 * lightweight-charts receives strictly increasing times.
 */
export function buildEquityCurve(entries: readonly JournalEntry[]): EquityCurve {
  const closed = [...entries]
    .filter((e): e is JournalEntry & { closedAt: number; rMultiple: number } => {
      if (e.closedAt === null || e.closedAt === undefined) return false;
      if (e.rMultiple === null || e.rMultiple === undefined) return false;
      return true;
    })
    .sort((a, b) => a.openedAt - b.openedAt);

  let sum = 0;
  const data: EquityPoint[] = [];

  for (const e of closed) {
    sum += e.rMultiple;
    const t = Math.floor(e.closedAt / 1000);
    const last = data[data.length - 1];
    const lastTime = last ? Number(last.time) : undefined;
    const time: UTCTimestamp =
      lastTime !== undefined && t <= lastTime ? ((lastTime + 1) as UTCTimestamp) : (t as UTCTimestamp);

    data.push({ time, value: sum });
  }

  return {
    data,
    totalR: data.length > 0 ? data[data.length - 1]!.value : 0,
  };
}
