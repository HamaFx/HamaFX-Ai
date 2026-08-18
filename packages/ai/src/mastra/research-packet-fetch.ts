import { getCandlesWithMeta, getPriceWithMeta } from '@kestrel/data';

import { XAUUSD_RESEARCH_WINDOWS } from './research-config';
import { XAUUSD } from './types';

export interface XauusdResearchFetchResult {
  price: PromiseSettledResult<Awaited<ReturnType<typeof getPriceWithMeta>>>;
  candles: readonly PromiseSettledResult<Awaited<ReturnType<typeof getCandlesWithMeta>>>[];
}

function abortError(): Error {
  const error = new Error('XAUUSD research was cancelled');
  error.name = 'AbortError';
  return error;
}

/** Fetch price and all required timeframe windows concurrently. */
export async function fetchXauusdResearchData(
  signal?: AbortSignal,
): Promise<XauusdResearchFetchResult> {
  if (signal?.aborted) throw signal.reason ?? abortError();

  const results = await Promise.allSettled([
    getPriceWithMeta(XAUUSD, signal ? { signal } : {}),
    ...XAUUSD_RESEARCH_WINDOWS.map(({ timeframe, candleCount }) =>
      getCandlesWithMeta(XAUUSD, timeframe, {
        count: candleCount,
        ...(signal ? { signal } : {}),
      }),
    ),
  ]);

  if (signal?.aborted) throw signal.reason ?? abortError();

  const [price, ...candles] = results;
  if (!price) throw new Error('XAUUSD research price fetch did not produce a result');

  return {
    price: price as XauusdResearchFetchResult['price'],
    candles: candles as XauusdResearchFetchResult['candles'],
  };
}
