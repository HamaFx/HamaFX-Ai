// Generic primary-then-fallback runner shared by all adapters.
//
// Behavior:
//   1. Try providers in order.
//   2. On ProviderError, log and continue. Re-throw the FIRST error if all fail.
//   3. Quota errors short-circuit (no point retrying the same minute).
//
// Adapters may pre-filter the provider list (e.g. candles-capable only).

import { ProviderError } from './errors';

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

  let firstError: ProviderError | null = null;
  for (const a of attempts) {
    try {
      const value = await a.run();
      return { value, provider: a.name };
    } catch (err) {
      if (!(err instanceof ProviderError)) throw err;
      // Log to console so Vercel logs show the failover trail.
      console.warn(`[data] provider ${a.name} failed (${err.code}): ${err.message} — trying next`);
      if (!firstError) firstError = err;
      // Quota errors are sticky — but we still try the next provider since
      // the next one may be on a different quota.
    }
  }
  throw firstError ?? new ProviderError('NO_PROVIDER_AVAILABLE', 'none', 'all providers failed');
}
