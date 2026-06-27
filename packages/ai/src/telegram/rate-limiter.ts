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

// Per-user rate limiting for Telegram bot commands.
//
// Uses a sliding window counter per user+action. Prevents abuse and
// controls AI token spend. In multi-instance deployments, this should
// be backed by Redis.

interface RateLimitEntry {
  count: number;
  windowStart: number;
}

const rateLimits = new Map<string, RateLimitEntry>();
const WINDOW_MS = 60 * 1000; // 1 minute window

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  limit: number;
  resetMs: number; // ms until the window resets
}

/**
 * Check and consume a rate limit slot for a user+action.
 * Returns { allowed: true } if within limits, { allowed: false } if exceeded.
 */
export function checkRateLimit(
  userId: string,
  action: string,
  limit: number,
): RateLimitResult {
  const key = `${userId}:${action}`;
  const now = Date.now();

  const entry = rateLimits.get(key);

  if (!entry || now - entry.windowStart >= WINDOW_MS) {
    // New window
    rateLimits.set(key, { count: 1, windowStart: now });
    return { allowed: true, remaining: limit - 1, limit, resetMs: WINDOW_MS };
  }

  if (entry.count >= limit) {
    const resetMs = WINDOW_MS - (now - entry.windowStart);
    return { allowed: false, remaining: 0, limit, resetMs };
  }

  entry.count++;
  return { allowed: true, remaining: limit - entry.count, limit, resetMs: Math.max(0, WINDOW_MS - (now - entry.windowStart)) };
}

/**
 * Get current rate limit status without consuming a slot.
 */
export function getRateLimitStatus(userId: string, action: string, limit: number): RateLimitResult {
  const key = `${userId}:${action}`;
  const now = Date.now();
  const entry = rateLimits.get(key);

  if (!entry || now - entry.windowStart >= WINDOW_MS) {
    return { allowed: true, remaining: limit, limit, resetMs: 0 };
  }

  const resetMs = Math.max(0, WINDOW_MS - (now - entry.windowStart));
  return {
    allowed: entry.count < limit,
    remaining: Math.max(0, limit - entry.count),
    limit,
    resetMs,
  };
}

/**
 * Reset rate limits for a user (for testing).
 */
export function _resetRateLimitsForTesting(): void {
  rateLimits.clear();
}