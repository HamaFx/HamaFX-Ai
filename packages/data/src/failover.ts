// Generic primary-then-fallback runner shared by all adapters.
//
// Behavior:
//   1. Reorder providers by recent health score (Phase 7a).
//   2. Try providers in the resulting order.
//   3. On ProviderError, log + record failure + continue.
//   4. On success, record success against the chosen provider.
//   5. Re-throw the FIRST error if all fail.
//   6. PROVIDER_QUOTA_EXCEEDED also nudges the adaptive throttle so the
//      next reservation against this provider sees a tighter cap.
//
// Adapters may pre-filter the provider list (e.g. candles-capable only).

import { ProviderError } from './errors';
import { getScore, recordFailure, recordSuccess } from './health';

export interface ProviderAttempt<T> {
  name: string;
  run(): Promise<T>;
}

export async function runWithFailover<T>(
  attempts: ProviderAttempt<T>[],
): Promise<{ value: T; provider: string }> {
  if (attempts.length === 0) {
    throw new ProviderError(
      'NO_PROVIDER_AVAILABLE',
      'none',
      'no providers configured for this resource',
    );
  }

  // Score-sort while preserving caller order on ties so the user's primary
  // intent isn't silently inverted by a single bad minute.
  const scored = attempts.map((a, i) => ({ a, i, score: getScore(a.name) }));
  scored.sort((x, y) => (y.score - x.score) || (x.i - y.i));

  let firstError: ProviderError | null = null;
  for (const { a } of scored) {
    try {
      const value = await a.run();
      recordSuccess(a.name);
      return { value, provider: a.name };
    } catch (err) {
      if (!(err instanceof ProviderError)) {
        // Non-ProviderError = bug; record + rethrow without trying the rest.
        recordFailure(a.name);
        throw err;
      }
      recordFailure(a.name);
      console.warn(`[data] provider ${a.name} failed (${err.code}): ${err.message} — trying next`);
      if (!firstError) firstError = err;
      // Quota errors are sticky — but we still try the next provider since
      // the next one may be on a different quota.
    }
  }
  throw firstError ?? new ProviderError('NO_PROVIDER_AVAILABLE', 'none', 'all providers failed');
}
