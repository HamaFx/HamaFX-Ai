/**
 * Copyright 2026 HamaFX - Tests for RL-3 LLM rate-limit governor
 */

import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import { noteLlmRateLimit, awaitLlmHeadroom } from '../src/llm-throttle';

describe('noteLlmRateLimit + awaitLlmHeadroom', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-16T00:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('resolves synchronously when no rate-limit data is stored', async () => {
    const started = Date.now();
    await awaitLlmHeadroom('p:unknown');
    expect(Date.now() - started).toBe(0);
  });

  it('resolves synchronously with healthy headroom', async () => {
    noteLlmRateLimit('p:groq', {
      remainingRequests: 100,
      remainingTokens: 5000,
      resetRequests: '60s',
      resetTokens: '60s',
    });
    const started = Date.now();
    await awaitLlmHeadroom('p:groq');
    expect(Date.now() - started).toBe(0);
  });

  it('waits when remaining-requests is 0 and reset is in the future', async () => {
    noteLlmRateLimit('p:openai', {
      remainingRequests: 0,
      remainingTokens: 1000,
      resetRequests: '2s',
    });

    const promise = awaitLlmHeadroom('p:openai');
    // Advance just past the 2s reset + a tiny epsilon
    vi.advanceTimersByTime(2100);
    await promise; // should resolve after the wait
  });

  it('caps wait at MAX_WAIT_MS (5s)', async () => {
    noteLlmRateLimit('p:openai', {
      remainingRequests: 0,
      resetRequests: '999s', // huge reset, should be capped
    });

    const promise = awaitLlmHeadroom('p:openai');
    // Advance 5s (the cap), plus epsilon
    vi.advanceTimersByTime(5100);
    await promise;
  });

  it('proceeds immediately when remaining-tokens is 0 but reset has elapsed', async () => {
    noteLlmRateLimit('p:gemini', {
      remainingTokens: 0,
      resetTokens: '1s',
    });

    // Advance past the reset
    vi.advanceTimersByTime(2000);

    const started = Date.now();
    await awaitLlmHeadroom('p:gemini');
    // Should resolve immediately since reset is in the past
    expect(Date.now() - started).toBe(0);
  });

  it('does not throw on invalid data (fail-open)', async () => {
    // @ts-expect-error Testing invalid input
    noteLlmRateLimit('p:x', null);
    await expect(awaitLlmHeadroom('p:x')).resolves.toBeUndefined();
  });

  it('respects AbortSignal and cancels the wait', async () => {
    const ctrl = new AbortController();
    noteLlmRateLimit('p:aborted', {
      remainingRequests: 0,
      resetRequests: '10s',
    });

    const promise = awaitLlmHeadroom('p:aborted', { signal: ctrl.signal });
    // Abort before the reset elapses
    vi.advanceTimersByTime(100); // let the promise start
    ctrl.abort();
    await promise; // should resolve immediately after abort
  });
});
