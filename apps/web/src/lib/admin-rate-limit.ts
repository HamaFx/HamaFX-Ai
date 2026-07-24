// SPDX-License-Identifier: Apache-2.0

// In-memory per-admin rate limiter for low-volume ops endpoints.
// Not intended for high-throughput paths — use the Postgres-backed
// withRateLimit for those. This module is stateful per Node process, so
// it only makes sense for dev/ops tools where approximate per-process
// throttling is acceptable.

interface Bucket {
  count: number;
  windowStart: number;
}

const buckets = new Map<string, Bucket>();

export interface AdminRateLimitResult {
  allowed: boolean;
  retryAfter?: number;
}

/**
 * Check whether a request from the given admin is within the rate limit.
 * Counts are tracked in-memory with a fixed sliding-ish window. Returns
 * `{ allowed: true }` if under the limit, otherwise `{ allowed: false }`
 * with a suggested `Retry-After` in seconds.
 */
export function checkAdminRateLimit(
  adminUserId: string,
  maxRequests = 5,
  windowMs = 60_000,
): AdminRateLimitResult {
  const now = Date.now();
  const bucket = buckets.get(adminUserId) ?? { count: 0, windowStart: now };

  if (now - bucket.windowStart > windowMs) {
    bucket.count = 0;
    bucket.windowStart = now;
  }

  bucket.count++;
  buckets.set(adminUserId, bucket);

  if (bucket.count > maxRequests) {
    const retryAfter = Math.ceil((bucket.windowStart + windowMs - now) / 1000);
    return { allowed: false, retryAfter: Math.max(1, retryAfter) };
  }

  return { allowed: true };
}

/** Reset all buckets. Exported for test isolation. */
export function resetAdminRateLimit(): void {
  buckets.clear();
}
