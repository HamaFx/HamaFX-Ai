// Timeframe-aware defaults for SMC parameters.
import type { Timeframe } from '@hamafx/shared';

/**
 * Adaptive swing lookback: smaller k for fast timeframes (less noise),
 * larger k for slow timeframes (more significant swings).
 */
export function defaultSwingLookback(tf: Timeframe): number {
  switch (tf) {
    case '1m':
    case '5m':
      return 2;
    case '15m':
    case '30m':
    case '1h':
      return 3;
    case '4h':
    case '1d':
    case '1w':
      return 5;
  }
}
