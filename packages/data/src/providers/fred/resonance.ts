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

import { fetchObservations, type FredObservation } from './rest';

export interface IntermarketResonanceInputData {
  realYields: FredObservation[];
  breakevenInflation: FredObservation[];
}

export interface FetchResonanceInputsParams {
  apiKey: string;
  /** YYYY-MM-DD */
  start: string;
  /** YYYY-MM-DD */
  end: string;
  signal?: AbortSignal;
}

/**
 * Fetch intermarket variables (US 10-Year Real Yields & 10-Year Breakeven Inflation) in parallel.
 */
export async function fetchResonanceInputs(
  params: FetchResonanceInputsParams,
): Promise<IntermarketResonanceInputData> {
  const [realYields, breakevenInflation] = await Promise.all([
    fetchObservations({
      apiKey: params.apiKey,
      seriesId: 'DFII10', // US 10-Year Real Yields
      start: params.start,
      end: params.end,
      ...(params.signal ? { signal: params.signal } : {}),
    }),
    fetchObservations({
      apiKey: params.apiKey,
      seriesId: 'T10YIE', // 10-Year Breakeven Inflation Rate
      start: params.start,
      end: params.end,
      ...(params.signal ? { signal: params.signal } : {}),
    }),
  ]);

  return {
    realYields,
    breakevenInflation,
  };
}
