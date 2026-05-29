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
// Phase 2 hardening §2 — `pinned: true` keeps an attempt in its
// caller-specified position regardless of health. The live-ticks /
// candles-1m pseudo-providers use this so a transient empty result
// during worker restart doesn't permanently demote the SignalR
// pipeline below the BiQuote REST fallback. `ProviderEmptyError` is a
// dedicated sentinel that bypasses the health-failure write altogether
// for the same reason.
//
// Adapters may pre-filter the provider list (e.g. candles-capable only).

import { ProviderEmptyError, ProviderError } from './errors';
import { getScore, recordFailure, recordSuccess } from './health';

export interface ProviderAttempt<T> {
  name: string;
  /**
   * When true, this attempt keeps its caller-specified position in the
   * try-order regardless of recent health. Use for "primary" providers
   * the operator wants honoured even when their score temporarily dips
   * (e.g. live-ticks during worker restart).
   */
  pinned?: boolean;
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

  // Pinned attempts keep their caller order; the rest are health-sorted
  // while preserving caller order on score ties so the user's primary
  // intent isn't silently inverted by a single bad minute.
  const pinned: ProviderAttempt<T>[] = [];
  const dynamic: { a: ProviderAttempt<T>; i: number; score: number }[] = [];
  attempts.forEach((a, i) => {
    if (a.pinned) {
      pinned.push(a);
    } else {
      dynamic.push({ a, i, score: getScore(a.name) });
    }
  });
  dynamic.sort((x, y) => (y.score - x.score) || (x.i - y.i));
  const ordered: ProviderAttempt<T>[] = [...pinned, ...dynamic.map((s) => s.a)];

  let firstError: ProviderError | null = null;
  // Phase 3 hardening §16 — re-throw the most-actionable error rather
  // than the first. A quota error is the operator's strongest signal
  // ("rotate the key" / "wait for reset"); HTTP errors and timeouts
  // are less actionable; other codes go last.
  let bestError: ProviderError | null = null;
  for (const a of ordered) {
    try {
      const value = await a.run();
      recordSuccess(a.name);
      return { value, provider: a.name };
    } catch (err) {
      if (err instanceof ProviderEmptyError) {
        // Empty != failure. The provider has nothing to offer right
        // now — try the next one without dinging its health score.
        // This is the fix for the live-ticks demotion bug.
        console.info(
          `[data] provider ${a.name} returned empty: ${err.message} — trying next`,
        );
        continue;
      }
      if (!(err instanceof ProviderError)) {
        // Non-ProviderError = bug; record + rethrow without trying the rest.
        recordFailure(a.name);
        throw err;
      }
      recordFailure(a.name);
      console.warn(`[data] provider ${a.name} failed (${err.code}): ${err.message} — trying next`);
      if (!firstError) firstError = err;
      if (!bestError || rankProviderError(err) > rankProviderError(bestError)) {
        bestError = err;
      }
      // Quota errors are sticky — but we still try the next provider since
      // the next one may be on a different quota.
    }
  }
  throw bestError ?? firstError ?? new ProviderError('NO_PROVIDER_AVAILABLE', 'none', 'all providers failed');
}

/**
 * Rank a `ProviderError` by how much information it gives the
 * operator. Higher = more actionable. Used by `runWithFailover` to
 * decide which error to re-throw when every provider failed.
 */
function rankProviderError(err: ProviderError): number {
  switch (err.code) {
    case 'PROVIDER_QUOTA_EXCEEDED':
      // The strongest "your config / billing is wrong" signal.
      return 3;
    case 'PROVIDER_HTTP_ERROR':
    case 'PROVIDER_TIMEOUT':
      // Both indicate transient upstream trouble; the message body
      // usually carries enough detail to debug.
      return 2;
    default:
      // PROVIDER_PARSE_ERROR, NO_PROVIDER_AVAILABLE.
      return 1;
  }
}
