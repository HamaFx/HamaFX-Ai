// Tool: get_session_levels.
//
// Slices today's (and optionally the prior day's) 1H candles by UTC
// session boundaries — Asia 00:00–07:00, London 07:00–12:00, NY 12:00–
// 21:00 — and returns each session's OHLC + a `forming` flag when the
// session window's right edge is in the future. Boundaries match the
// LIVE_SNAPSHOT classifier in `packages/ai/src/context.ts`.

import { getCandles } from '@hamafx/data';
import {
  GetSessionLevelsInputSchema,
  type Candle,
  type GetSessionLevelsOutput,
  type SessionRange,
  type SessionTag,
} from '@hamafx/shared';
import { tool } from 'ai';
import type { z } from 'zod';

const InputSchema = GetSessionLevelsInputSchema;

declare module '@hamafx/shared' {
  interface ToolIOMap {
    get_session_levels: { input: z.infer<typeof InputSchema> };
  }
}

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

interface SessionWindow {
  session: SessionTag;
  startHour: number;
  endHour: number;
}

const SESSIONS: readonly SessionWindow[] = [
  { session: 'asia', startHour: 0, endHour: 7 },
  { session: 'london', startHour: 7, endHour: 12 },
  { session: 'ny', startHour: 12, endHour: 21 },
];

export const getSessionLevelsTool = tool({
  description:
    "Compute today's (and optionally yesterday's) Asia / London / NY session OHLC levels for one symbol. Use when the user asks 'where did Asia top out', 'show the London open', 'NY range', or wants intraday session context. Returns per-session open / high / low / close + a `forming` flag when the session is still in progress.",
  inputSchema: InputSchema,
  execute: async ({ symbol, includePrior }): Promise<GetSessionLevelsOutput> => {
    // 48h of 1H bars covers today + yesterday including the final NY close.
    const candles = await getCandles(symbol, '1h', { count: 60 });
    const now = Date.now();
    const startOfToday = startOfUtcDay(now);

    if (candles.length === 0) {
      return {
        symbol,
        asOf: now,
        today: [],
        prior: includePrior ? [] : null,
        pipelinePending: true,
      };
    }

    const today = SESSIONS.map((w) => sliceSession(candles, startOfToday, now, w));
    const prior = includePrior
      ? SESSIONS.map((w) => sliceSession(candles, startOfToday - DAY_MS, now, w))
      : null;

    return { symbol, asOf: now, today, prior, pipelinePending: false };
  },
});

function sliceSession(
  candles: Candle[],
  dayStartMs: number,
  nowMs: number,
  win: SessionWindow,
): SessionRange {
  const fromMs = dayStartMs + win.startHour * HOUR_MS;
  const toMs = dayStartMs + win.endHour * HOUR_MS;
  const inWindow = candles.filter((c) => c.t >= fromMs && c.t < toMs);

  if (inWindow.length === 0) {
    return {
      session: win.session,
      fromMs,
      toMs,
      open: null,
      high: null,
      low: null,
      close: null,
      forming: nowMs < toMs,
    };
  }

  let high = Number.NEGATIVE_INFINITY;
  let low = Number.POSITIVE_INFINITY;
  for (const c of inWindow) {
    if (c.h > high) high = c.h;
    if (c.l < low) low = c.l;
  }

  const sessionEnded = nowMs >= toMs;
  return {
    session: win.session,
    fromMs,
    toMs,
    open: inWindow[0]!.o,
    high: Number.isFinite(high) ? high : null,
    low: Number.isFinite(low) ? low : null,
    close: sessionEnded ? inWindow[inWindow.length - 1]!.c : null,
    forming: !sessionEnded,
  };
}

function startOfUtcDay(ms: number): number {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}
