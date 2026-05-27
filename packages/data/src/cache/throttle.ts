// Per-provider self-throttle. Personal-mode: a small in-memory token bucket
// per provider so we never accidentally burn a free-tier daily quota. State
// is per Vercel function instance; that's accepted, because:
//   1. We're a single user, the multiplier across instances is small.
//   2. The cache absorbs the duplicate calls anyway.
//
// Phase 7a — adaptive throttle: when an upstream returns 429 we lower the
// effective cap to a configurable fraction (default 80 %) for the next
// `cooloffMs`. The cap recovers automatically when the cooloff elapses.
//
// If we ever need a globally consistent counter, swap this for an Upstash
// `INCR + EXPIRE` pair. Public surface stays the same.

export interface ThrottleConfig {
  /** Max calls allowed per window. */
  limit: number;
  /** Window length in ms. */
  windowMs: number;
  /**
   * After a 429-style backoff signal, drop the effective cap to this
   * fraction of `limit` for `cooloffMs`. Default 0.8.
   */
  backoffFraction?: number;
  /** ms the reduced cap stays in effect after a backoff. Default 90s. */
  cooloffMs?: number;
}

interface Bucket {
  /** Calls counted within the current window. */
  count: number;
  /** ms epoch UTC when the current window started. */
  windowStart: number;
  /** ms epoch UTC when the current backoff (if any) lifts. 0 = no backoff. */
  backoffUntil: number;
}

const buckets = new Map<string, Bucket>();

function getBucket(provider: string, now: number): Bucket {
  const existing = buckets.get(provider);
  if (existing) return existing;
  const fresh: Bucket = { count: 0, windowStart: now, backoffUntil: 0 };
  buckets.set(provider, fresh);
  return fresh;
}

function effectiveLimit(cfg: ThrottleConfig, b: Bucket, now: number): number {
  if (b.backoffUntil > now) {
    const fraction = cfg.backoffFraction ?? 0.8;
    return Math.max(1, Math.floor(cfg.limit * fraction));
  }
  return cfg.limit;
}

/**
 * Reserve one call against `provider`. Returns true if allowed.
 * Auto-rolls the window forward when expired.
 */
export function tryReserve(provider: string, cfg: ThrottleConfig): boolean {
  const now = Date.now();
  const b = getBucket(provider, now);
  if (now - b.windowStart >= cfg.windowMs) {
    b.count = 1;
    b.windowStart = now;
    return true;
  }
  if (b.count >= effectiveLimit(cfg, b, now)) return false;
  b.count += 1;
  return true;
}

/**
 * Signal that the upstream just returned a quota / rate-limit response.
 * The next call to `tryReserve` will see the reduced cap; the cap recovers
 * automatically after `cooloffMs`.
 */
export function noteBackoff(provider: string, cfg: ThrottleConfig): void {
  const now = Date.now();
  const b = getBucket(provider, now);
  const cooloff = cfg.cooloffMs ?? 90_000;
  b.backoffUntil = now + cooloff;
}

/** Test helper. */
export function _resetThrottle(): void {
  buckets.clear();
}
