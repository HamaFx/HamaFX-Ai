// BiQuote ↔ internal mapping. Single source of truth for all symbol /
// timeframe / datetime conversions between our internal vocabulary and
// BiQuote's wire format.
//
// BiQuote uses our concatenated symbol codes verbatim (`XAUUSD`,
// `EURUSD`, `GBPUSD` — visible on https://biquote.io). The mapping is
// the identity function but the indirection stays so adapters can rely on
// `toBiquoteSymbol(symbol)` everywhere, just like Twelve Data and Finnhub.
//
// Reference: https://biquote.io/docs

import type { BiquoteTimeframe } from '@hamafx/shared';
import type { Symbol, Timeframe } from '@hamafx/shared';

const TO_BIQUOTE_SYMBOL: Record<Symbol, string> = {
  XAUUSD: 'XAUUSD',
  EURUSD: 'EURUSD',
  GBPUSD: 'GBPUSD',
};

/**
 * BiQuote's `/api/{symbol}/ohlc` endpoint accepts M1..D1. There is no W1.
 * We reject 1w at the adapter boundary — the caller falls back to a
 * different provider for weekly bars (Twelve Data / Alpha Vantage).
 */
const TO_BIQUOTE_TIMEFRAME: Record<Exclude<Timeframe, '1w'>, BiquoteTimeframe> = {
  '1m': 'M1',
  '5m': 'M5',
  '15m': 'M15',
  '30m': 'M30',
  '1h': 'H1',
  '4h': 'H4',
  '1d': 'D1',
};

export function toBiquoteSymbol(symbol: Symbol): string {
  return TO_BIQUOTE_SYMBOL[symbol];
}

/**
 * Map an internal timeframe to BiQuote's notation. Returns `null` for
 * timeframes BiQuote doesn't support (currently just `1w`); callers should
 * check the result and fall through to another provider for weekly bars.
 */
export function toBiquoteTimeframe(tf: Timeframe): BiquoteTimeframe | null {
  if (tf === '1w') return null;
  return TO_BIQUOTE_TIMEFRAME[tf];
}

/**
 * BiQuote returns ISO-8601 UTC strings (e.g. `"2026-05-27T18:35:01Z"` or
 * sometimes `"2026-05-27T18:35:01.234Z"`). Both are JS-Date-parsable.
 * Throws on malformed input so callers fail fast instead of writing NaN
 * timestamps to Postgres.
 */
export function parseBiquoteDate(s: string): number {
  const t = Date.parse(s);
  if (Number.isNaN(t)) {
    throw new Error(`biquote: cannot parse datetime "${s}"`);
  }
  return t;
}
