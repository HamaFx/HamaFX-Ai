import { z } from 'zod';

export const TIMEFRAMES = ['1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w'] as const;
export type Timeframe = (typeof TIMEFRAMES)[number];

export const TimeframeSchema = z.enum(TIMEFRAMES);

export function isTimeframe(value: unknown): value is Timeframe {
  return typeof value === 'string' && (TIMEFRAMES as readonly string[]).includes(value);
}

/** Approx milliseconds per bar — for cache TTLs and time math. */
export function msPerTimeframe(tf: Timeframe): number {
  switch (tf) {
    case '1m':
      return 60_000;
    case '5m':
      return 5 * 60_000;
    case '15m':
      return 15 * 60_000;
    case '30m':
      return 30 * 60_000;
    case '1h':
      return 60 * 60_000;
    case '4h':
      return 4 * 60 * 60_000;
    case '1d':
      return 24 * 60 * 60_000;
    case '1w':
      return 7 * 24 * 60 * 60_000;
  }
}

export const DEFAULT_TIMEFRAME: Timeframe = '1h';
