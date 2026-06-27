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

// Tests for STAB-06: withRetry exponential backoff helper.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { withRetry } from './retry';

// Speed up: make the retry helper skip real timer delays.
vi.mock('./retry', async (importOriginal) => {
  const original = await importOriginal<typeof import('./retry')>();

  // Patch jitteredDelay to return 0 in tests so they don't actually sleep.
  return {
    ...original,
    withRetry: async <T>(fn: () => Promise<T>, opts = {}) =>
      original.withRetry(fn, { ...opts, baseDelayMs: 0 }),
  };
});

describe('withRetry — success on first attempt', () => {
  it('returns the resolved value immediately', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const result = await withRetry(fn, { baseDelayMs: 0 });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('withRetry — retries on transient errors', () => {
  it('retries 429 errors and succeeds eventually', async () => {
    const rateLimitErr = Object.assign(new Error('rate limit'), { statusCode: 429 });
    const fn = vi
      .fn()
      .mockRejectedValueOnce(rateLimitErr)
      .mockRejectedValueOnce(rateLimitErr)
      .mockResolvedValue('recovered');

    const result = await withRetry(fn, { maxAttempts: 3, baseDelayMs: 0 });
    expect(result).toBe('recovered');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('retries 500 errors and succeeds eventually', async () => {
    const serverErr = Object.assign(new Error('internal'), { statusCode: 500 });
    const fn = vi.fn().mockRejectedValueOnce(serverErr).mockResolvedValue('ok');

    const result = await withRetry(fn, { maxAttempts: 3, baseDelayMs: 0 });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('throws after maxAttempts are exhausted', async () => {
    const serverErr = Object.assign(new Error('always fails'), { statusCode: 503 });
    const fn = vi.fn().mockRejectedValue(serverErr);

    await expect(withRetry(fn, { maxAttempts: 3, baseDelayMs: 0 })).rejects.toThrow('always fails');
    expect(fn).toHaveBeenCalledTimes(3);
  });
});

describe('withRetry — does NOT retry hard errors', () => {
  it('throws immediately on 400 Bad Request', async () => {
    const badRequest = Object.assign(new Error('bad request'), { statusCode: 400 });
    const fn = vi.fn().mockRejectedValue(badRequest);

    await expect(withRetry(fn, { maxAttempts: 3, baseDelayMs: 0 })).rejects.toThrow('bad request');
    // Should only call once — no retries for 4xx non-429.
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('throws immediately on 404 Not Found', async () => {
    const notFound = Object.assign(new Error('not found'), { statusCode: 404 });
    const fn = vi.fn().mockRejectedValue(notFound);

    await expect(withRetry(fn, { maxAttempts: 3, baseDelayMs: 0 })).rejects.toThrow('not found');
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('withRetry — onRetry callback', () => {
  it('calls onRetry with attempt number and delay', async () => {
    const err = Object.assign(new Error('upstream'), { statusCode: 502 });
    const fn = vi.fn().mockRejectedValueOnce(err).mockResolvedValue('done');
    const onRetry = vi.fn();

    await withRetry(fn, { maxAttempts: 3, baseDelayMs: 0, onRetry });
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenCalledWith(err, 0, expect.any(Number));
  });
});

describe('withRetry — custom isRetryable', () => {
  it('respects custom predicate to skip retries', async () => {
    const err = new Error('custom non-retryable');
    const fn = vi.fn().mockRejectedValue(err);

    await expect(
      withRetry(fn, { maxAttempts: 3, baseDelayMs: 0, isRetryable: () => false }),
    ).rejects.toThrow('custom non-retryable');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('respects custom predicate to always retry', async () => {
    const err = Object.assign(new Error('always-retry'), { statusCode: 401 });
    // 401 is auth error — not retryable by default, but custom predicate can override.
    const fn = vi.fn().mockRejectedValue(err);

    await expect(
      withRetry(fn, { maxAttempts: 2, baseDelayMs: 0, isRetryable: () => true }),
    ).rejects.toThrow('always-retry');
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
