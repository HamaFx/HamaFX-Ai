// Per-provider self-throttle. Personal-mode: a small in-memory token bucket
// per provider so we never accidentally burn a free-tier daily quota. State
// is per Vercel function instance; that's accepted, because:
//   1. We're a single user, the multiplier across instances is small.
//   2. The cache absorbs the duplicate calls anyway.
//
// If we ever need a globally consistent counter, swap this for an Upstash
// `INCR + EXPIRE` pair. Public surface stays the same.

export interface ThrottleConfig {
  /** Max calls allowed per window. */
  limit: number;
  /** Window length in ms. */
  windowMs: number;
}

interface Bucket {
  /** Calls counted within the current window. */
  count: number;
  /** ms epoch UTC when the current window started. */
  windowStart: number;
}

const buckets = new Map<string, Bucket>();

/**
 * Reserve one call against `provider`. Returns true if allowed.
 * Auto-rolls the window forward when expired.
 */
export function tryReserve(provider: string, cfg: ThrottleConfig): boolean {
  const now = Date.now();
  const existing = buckets.get(provider);
  if (!existing || now - existing.windowStart >= cfg.windowMs) {
    buckets.set(provider, { count: 1, windowStart: now });
    return true;
  }
  if (existing.count >= cfg.limit) return false;
  existing.count += 1;
  return true;
}

/** Test helper. */
export function _resetThrottle(): void {
  buckets.clear();
}
