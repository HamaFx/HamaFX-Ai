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
