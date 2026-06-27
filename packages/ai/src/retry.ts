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

export interface RetryOptions {
  /** Max number of attempts (default 3 — 1 initial + 2 retries). */
  maxAttempts?: number;
  /** Base delay in ms before the first retry (default 500ms). */
  baseDelayMs?: number;
  /** Maximum delay cap in ms (default 10_000ms). */
  maxDelayMs?: number;
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

      const delayMs = jitteredDelay(baseDelayMs, attempt, maxDelayMs);
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
