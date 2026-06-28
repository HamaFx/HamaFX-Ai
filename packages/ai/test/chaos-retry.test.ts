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

// Phase 4.4: Chaos / failure injection tests for the retry infrastructure
// (STAB-06). Tests exercise withRetry under transient failures, AbortSignal
// cancellation, and a simulation of the circuit-breaker pattern layered on
// top of the retry helper.
//
// NOTE: fake timers are NOT used here because `withRetry` uses setTimeout
// internally for backoff sleep. With baseDelayMs=0, `jitteredDelay` returns
// 0 → setTimeout(fn, 0) resolves on the next microtask tick, which is
// effectively immediate with real timers.

import { describe, expect, it, vi } from 'vitest';

import { withRetry } from '../src/retry';

const BASE_OPTS = { baseDelayMs: 0 };

// ---------------------------------------------------------------------------
// Retry behaviour on transient failures
// ---------------------------------------------------------------------------

describe('chaos: retry on transient failures', () => {
  it('succeeds on first attempt when no failure occurs', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const result = await withRetry(fn, { maxAttempts: 3, ...BASE_OPTS });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('recovers after one transient 503 failure', async () => {
    const err = Object.assign(new Error('upstream down'), { statusCode: 503 });
    const fn = vi.fn().mockRejectedValueOnce(err).mockResolvedValue('recovered');
    const result = await withRetry(fn, { maxAttempts: 3, ...BASE_OPTS });
    expect(result).toBe('recovered');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('recovers after multiple transient 429 failures', async () => {
    const rateLimit = Object.assign(new Error('rate limited'), { statusCode: 429 });
    const fn = vi
      .fn()
      .mockRejectedValueOnce(rateLimit)
      .mockRejectedValueOnce(rateLimit)
      .mockResolvedValue('ok');
    const result = await withRetry(fn, { maxAttempts: 4, ...BASE_OPTS });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('exhausts all retry attempts and throws the last error', async () => {
    const err = Object.assign(new Error('persistent failure'), { statusCode: 502 });
    const fn = vi.fn().mockRejectedValue(err);
    await expect(withRetry(fn, { maxAttempts: 3, ...BASE_OPTS })).rejects.toThrow('persistent failure');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('does not retry non-transient 400 errors', async () => {
    const badRequest = Object.assign(new Error('bad request'), { statusCode: 400 });
    const fn = vi.fn().mockRejectedValue(badRequest);
    await expect(withRetry(fn, { maxAttempts: 3, ...BASE_OPTS })).rejects.toThrow('bad request');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('does not retry 401 auth errors', async () => {
    const authErr = Object.assign(new Error('unauthorized'), { statusCode: 401 });
    const fn = vi.fn().mockRejectedValue(authErr);
    await expect(withRetry(fn, { maxAttempts: 3, ...BASE_OPTS })).rejects.toThrow('unauthorized');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('calls onRetry callback with error, attempt, and delay', async () => {
    const err = Object.assign(new Error('transient'), { statusCode: 502 });
    const fn = vi.fn().mockRejectedValueOnce(err).mockResolvedValue('done');
    const onRetry = vi.fn();
    await withRetry(fn, { maxAttempts: 3, ...BASE_OPTS, onRetry });
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenCalledWith(err, 0, expect.any(Number));
  });
});

// ---------------------------------------------------------------------------
// AbortSignal cancellation mid-operation
// ---------------------------------------------------------------------------

describe('chaos: AbortSignal cancellation', () => {
  it('aborts before any attempt throws AbortError', async () => {
    const ac = new AbortController();
    ac.abort();
    const fn = vi.fn().mockResolvedValue('never');
    await expect(withRetry(fn, { maxAttempts: 3, signal: ac.signal, ...BASE_OPTS })).rejects.toThrow(
      'Aborted',
    );
    expect(fn).not.toHaveBeenCalled();
  });

  it('aborts during retry backoff between attempts', async () => {
    const ac = new AbortController();
    const err = Object.assign(new Error('transient'), { statusCode: 502 });
    const fn = vi.fn().mockRejectedValue(err);

    // Use a delay that ensures we have time to abort during backoff.
    // The first attempt fails immediately (baseDelayMs=0 for execution),
    // but we wrap so the sleep uses a longer delay.
    const promise = withRetry(fn, { maxAttempts: 3, signal: ac.signal, baseDelayMs: 200 });

    // Trigger abort before the 200ms sleep completes.
    setTimeout(() => ac.abort(), 10);

    await expect(promise).rejects.toThrow('Aborted');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('aborts before the next retry when signal fires during backoff', async () => {
    const ac = new AbortController();
    const err = Object.assign(new Error('transient'), { statusCode: 503 });
    const fn = vi.fn().mockRejectedValue(err);

    // Cancel during the sleep after the first attempt.
    setTimeout(() => ac.abort(), 10);
    const promise = withRetry(fn, { maxAttempts: 3, signal: ac.signal, baseDelayMs: 200 });

    await expect(promise).rejects.toThrow('Aborted');
    // First attempt ran, then backoff was interrupted by abort.
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('throws the last error when all attempts exhausted despite signal', async () => {
    const ac = new AbortController();
    const err = Object.assign(new Error('always fails'), { statusCode: 502 });
    const fn = vi.fn().mockRejectedValue(err);

    // Abort happens after all retries done.
    setTimeout(() => ac.abort(), 200);

    await expect(withRetry(fn, { maxAttempts: 2, signal: ac.signal, ...BASE_OPTS })).rejects.toThrow(
      'always fails',
    );
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// Circuit-breaker pattern layered on retry
// ---------------------------------------------------------------------------

describe('chaos: circuit-breaker pattern response', () => {
  function createCircuitBreaker<T>(
    fn: () => Promise<T>,
    threshold: number,
    resetAfterMs: number,
  ): { execute: () => Promise<T>; state: () => string; reset: () => void } {
    let failures = 0;
    let openedAt = 0;
    let state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';

    return {
      state: () => state,
      reset: () => {
        failures = 0;
        state = 'CLOSED';
        openedAt = 0;
      },
      execute: async () => {
        if (state === 'OPEN') {
          const elapsed = Date.now() - openedAt;
          if (elapsed < resetAfterMs) {
            throw new Error(
              `[circuit-breaker] OPEN — failing fast (${Math.ceil((resetAfterMs - elapsed) / 1000)}s remaining)`,
            );
          }
          state = 'HALF_OPEN';
        }

        try {
          const result = await fn();
          if (state === 'HALF_OPEN') {
            state = 'CLOSED';
            failures = 0;
          } else {
            failures = 0;
          }
          return result;
        } catch (err) {
          failures += 1;
          if (state === 'HALF_OPEN' || failures >= threshold) {
            state = 'OPEN';
            openedAt = Date.now();
          }
          throw err;
        }
      },
    };
  }

  it('passes calls through when CLOSED', async () => {
    const inner = vi.fn().mockResolvedValue('ok');
    const cb = createCircuitBreaker(inner, 3, 60_000);
    expect(cb.state()).toBe('CLOSED');
    const result = await cb.execute();
    expect(result).toBe('ok');
    expect(cb.state()).toBe('CLOSED');
  });

  it('opens after threshold failures and fails fast', async () => {
    const inner = vi.fn().mockRejectedValue(new Error('fail'));
    const cb = createCircuitBreaker(inner, 2, 60_000);

    for (let i = 0; i < 2; i++) {
      await expect(cb.execute()).rejects.toThrow('fail');
    }
    expect(cb.state()).toBe('OPEN');

    await expect(cb.execute()).rejects.toThrow('circuit-breaker');
    expect(inner).toHaveBeenCalledTimes(2);
  });

  it('transitions OPEN -> HALF_OPEN -> CLOSED on successful probe', async () => {
    const inner = vi.fn().mockRejectedValueOnce(new Error('fail'));
    const cb = createCircuitBreaker(inner, 1, 0);

    await expect(cb.execute()).rejects.toThrow('fail');
    expect(cb.state()).toBe('OPEN');

    inner.mockResolvedValueOnce('recovered');
    const result = await cb.execute();
    expect(result).toBe('recovered');
    expect(cb.state()).toBe('CLOSED');
  });

  it('re-opens when HALF_OPEN probe fails', async () => {
    let callCount = 0;
    const inner = vi.fn().mockImplementation(() => {
      callCount += 1;
      return Promise.reject(new Error(`fail-${callCount}`));
    });
    const cb = createCircuitBreaker(inner, 2, 0);

    await expect(cb.execute()).rejects.toThrow('fail-1');
    await expect(cb.execute()).rejects.toThrow('fail-2');
    expect(cb.state()).toBe('OPEN');

    await expect(cb.execute()).rejects.toThrow('fail-3');
    expect(cb.state()).toBe('OPEN');
    expect(callCount).toBe(3);
  });

  it('honours resetAfterMs: remains OPEN until time elapses', async () => {
    const inner = vi.fn().mockRejectedValue(new Error('fail'));
    const cb = createCircuitBreaker(inner, 1, 10_000);

    await expect(cb.execute()).rejects.toThrow('fail');
    expect(cb.state()).toBe('OPEN');

    await expect(cb.execute()).rejects.toThrow('circuit-breaker');
    expect(inner).toHaveBeenCalledTimes(1);
  });

  it('resets properly via reset()', async () => {
    const inner = vi.fn().mockRejectedValue(new Error('fail'));
    const cb = createCircuitBreaker(inner, 1, 60_000);

    await expect(cb.execute()).rejects.toThrow('fail');
    expect(cb.state()).toBe('OPEN');

    cb.reset();
    expect(cb.state()).toBe('CLOSED');

    inner.mockResolvedValueOnce('ok');
    const result = await cb.execute();
    expect(result).toBe('ok');
  });

  it('works correctly with withRetry for transient failures before opening', async () => {
    const transientErr = Object.assign(new Error('rate limited'), { statusCode: 429 });
    const provider = vi.fn().mockRejectedValue(transientErr);

    const cb = createCircuitBreaker(
      () => withRetry(provider, { maxAttempts: 3, ...BASE_OPTS }),
      1,
      60_000,
    );

    // withRetry exhausts 3 attempts (all transient). CB catches the final
    // error and opens immediately (threshold=1).
    await expect(cb.execute()).rejects.toThrow('rate limited');
    expect(cb.state()).toBe('OPEN');
    expect(provider).toHaveBeenCalledTimes(3);

    // Second execute: fails fast — provider is not called again.
    await expect(cb.execute()).rejects.toThrow('circuit-breaker');
    expect(provider).toHaveBeenCalledTimes(3);
  });
});
