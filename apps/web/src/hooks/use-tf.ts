'use client';

// Timeframe URL state, backed by `?tf=` via nuqs. Symbol lives in the path
// (`/chart/[symbol]`) so it doesn't belong here.
//
// Why nuqs:
//   - `useState` would lose the timeframe on refresh.
//   - `useSearchParams` is read-only; nuqs gives us setter + parse.
//   - Other features (alerts list filters, news symbol filter) will reuse it.

import { parseAsStringLiteral, useQueryState } from 'nuqs';

import { DEFAULT_TIMEFRAME, TIMEFRAMES, type Timeframe } from '@hamafx/shared';

const tfParser = parseAsStringLiteral(TIMEFRAMES).withDefault(DEFAULT_TIMEFRAME);

export function useTimeframe(): [Timeframe, (tf: Timeframe) => void] {
  const [tf, setTf] = useQueryState('tf', tfParser);
  return [tf, (next) => void setTf(next)];
}
