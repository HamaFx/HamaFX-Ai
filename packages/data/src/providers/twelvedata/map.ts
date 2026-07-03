import type { Timeframe } from '@hamafx/shared';

const TO_TWELVEDATA_INTERVAL: Record<Timeframe, string> = {
  '1m': '1min',
  '5m': '5min',
  '15m': '15min',
  '30m': '30min',
  '1h': '1h',
  '4h': '4h',
  '1d': '1day',
  '1w': '1week',
};

export function toTwelveDataInterval(tf: Timeframe): string {
  return TO_TWELVEDATA_INTERVAL[tf];
}
