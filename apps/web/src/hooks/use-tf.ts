'use client';

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

// Timeframe URL state, backed by `?tf=` via nuqs. Symbol lives in the path
// (`/chart/[symbol]`) so it doesn't belong here.
//
// Why nuqs:
//   - `useState` would lose the timeframe on refresh.
//   - `useSearchParams` is read-only; nuqs gives us setter + parse.
//   - Other features (alerts list filters, news symbol filter) will reuse it.
import { DEFAULT_TIMEFRAME, TIMEFRAMES, type Timeframe } from '@hamafx/shared';
import { parseAsStringLiteral, useQueryState } from 'nuqs';

const tfParser = parseAsStringLiteral(TIMEFRAMES).withDefault(DEFAULT_TIMEFRAME);

export function useTimeframe(): [Timeframe, (tf: Timeframe) => void] {
  const [tf, setTf] = useQueryState('tf', tfParser);
  return [tf, (next) => void setTf(next)];
}
