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

// STAB-06: Exponential-backoff retry helper for external API calls.
//
// Design goals:
//   - Generic: wraps any async function returning a promise.
//   - Respects AbortSignal: stops retrying if the caller cancels.
//   - Backoff jitter: avoids thundering herd on simultaneous failures.
//   - Retry-on classification: only retries transient errors (429, 5xx, network).
//     Hard errors (4xx except 429) are surfaced immediately.
//
// Usage:
//   const result = await withRetry(() => fetchSomeApi(url), { signal });

import { classifyStreamError } from './fallback';

// ── Retry-After header parsing ─────────────────────────────────────────
// Phase A RL-4 — Honor server-advertised retry delays.

/**
 * Extract a Retry-After hint from an error in milliseconds, or null.
 * Reads (in order):
 *   1. `err.responseHeaders?.['retry-after']`  (AI SDK APICallError)
 *   2. `err.headers?.get('retry-after')`       (standard Response-like)
 *   3. `err.retryAfter`                         (plain number or string)
 * Supports both seconds (integer) and HTTP-date (RFC 7231) forms.
 */
export function getRetryAfterMs(err: unknown): number | null {
  const raw = readRetryAfter(err);
  if (raw === null) return null;

  // Seconds: "120" or just 120
  const seconds = Number(raw);
  if (!Number.isNaN(seconds) && String(seconds) === String(raw).trim()) {
    return Math.min(seconds * 1000, 60_000); // cap at 60s for safety
  }

  // HTTP-date: "Wed, 21 Oct 2015 07:28:00 GMT"
  const parsed = Date.parse(String(raw));
  if (!Number.isNaN(parsed)) {
    const ms = parsed - Date.now();
    return ms > 0 ? Math.min(ms, 60_000) : null;
  }

  return null;
}

function readRetryAfter(err: unknown): string | number | null {
  if (!err || typeof err !== 'object') return null;
  const e = err as Record<string, unknown>;

  // AI SDK APICallError has responseHeaders
  const responseHeaders = e.responseHeaders as Record<string, string> | undefined;
  if (responseHeaders?.['retry-after']) return responseHeaders['retry-after'];

  // Standard Response-like
  const headers = e.headers as { get(name: string): string | null } | undefined;
  if (headers?.get('retry-after')) return headers.get('retry-after')!;

  // Bare field
  if (e.retryAfter !== undefined) return e.retryAfter as string | number;

  return null;
}

export interface RetryOptions {
  /** Max number of attempts (default 3 — 1 initial + 2 retries). */
  maxAttempts?: number;
  /** Base delay in ms before the first retry (default 500ms). */
  baseDelayMs?: number;
  /** Maximum delay cap in ms (default 10_000ms). */
  maxDelayMs?: number;
  /**
   * Maximum delay when honoring a server Retry-After header (default 30_000ms).
   * Caps the header value to prevent excessive waits from a buggy upstream.
   */
  maxRetryAfterMs?: number;
  /** AbortSignal to cancel retries on client disconnect. */
  signal?: AbortSignal | null;
  /**
   * Custom predicate to decide whether an error is retryable.
   * Defaults to checking the classifyStreamError reason (429 / 5xx / timeout).
   */
  isRetryable?: (err: unknown, attempt: number) => boolean;
  /**
   * Called before each retry — useful for logging / tracing.
   */
  onRetry?: (err: unknown, attempt: number, delayMs: number) => void;
}

/** Compute delay with full jitter: random in [0, baseDelay * 2^attempt]. */
function jitteredDelay(base: number, attempt: number, max: number): number {
  const exponential = base * Math.pow(2, attempt);
  return Math.min(Math.random() * exponential, max);
}

function isTransientByDefault(err: unknown): boolean {
  const { reason } = classifyStreamError(err);
  return reason === 'rate-limit' || reason === 'upstream' || reason === 'timeout';
}

/**
 * Retry `fn` up to `maxAttempts` times with exponential backoff + full jitter.
 * Throws the last error if all attempts fail, or if the error is not retryable.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const {
    maxAttempts = 3,
    baseDelayMs = 500,
    maxDelayMs = 10_000,
    maxRetryAfterMs = 30_000,
    signal = null,
    isRetryable = isTransientByDefault,
    onRetry,
  } = options;

  let lastErr: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    // Check for cancellation before each attempt.
    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }

    try {
      return await fn();
    } catch (err) {
      lastErr = err;

      // Don't retry if this is the last attempt.
      if (attempt >= maxAttempts - 1) break;

      // Don't retry non-transient errors.
      if (!isRetryable(err, attempt)) throw err;

      // Don't retry if we've been cancelled.
      if (signal?.aborted) throw err;

      // Honor server Retry-After header; use max(jittered, retryAfter, capped).
      const retryAfterMs = getRetryAfterMs(err);
      const baseDelay = jitteredDelay(baseDelayMs, attempt, maxDelayMs);
      const delayMs =
        retryAfterMs !== null
          ? Math.min(Math.max(baseDelay, retryAfterMs), maxRetryAfterMs)
          : baseDelay;
      onRetry?.(err, attempt, delayMs);

      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, delayMs);
        // Allow abort to cancel the sleep too.
        signal?.addEventListener('abort', () => {
          clearTimeout(timer);
          reject(new DOMException('Aborted', 'AbortError'));
        }, { once: true });
      });
    }
  }

  throw lastErr;
}
