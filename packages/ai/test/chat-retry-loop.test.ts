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

// Plan 04 §5 — Characterization tests for chat-retry-loop.ts.
// Tests the retry/fallback executor in isolation with a mocked attempt
// callback, fallback classifier, and budget handle.

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

let mockClassifyStreamError: ReturnType<typeof vi.fn>;
let mockMakeFallbackPart: ReturnType<typeof vi.fn>;
let mockPickNextFallbackProvider: ReturnType<typeof vi.fn>;

vi.mock('../src/fallback', () => ({
  get classifyStreamError() {
    return mockClassifyStreamError;
  },
  get makeFallbackPart() {
    return mockMakeFallbackPart;
  },
}));

vi.mock('../src/model-resolution', () => ({
  get pickNextFallbackProvider() {
    return mockPickNextFallbackProvider;
  },
}));

import { runChatWithFallback } from '../src/chat-retry-loop';
import type { BudgetHandle } from '../src/budget-reservation';
import type { AttemptContext, AttemptResult, RetryLoopArgs } from '../src/chat-retry-loop';

function makeBudget(overrides?: Partial<BudgetHandle>): BudgetHandle {
  return {
    reservedUsd: 0.01,
    spent: 0.05,
    max: 5.0,
    released: false,
    reconcile: vi.fn(() => Promise.resolve()),
    release: vi.fn(() => Promise.resolve()),
    ...overrides,
  };
}

function makeSuccessResult<T>(value: T): AttemptResult<T> {
  return { success: true, value };
}

function makeErrorResult(overrides?: Partial<AttemptResult<string>>): AttemptResult<string> {
  return {
    success: false,
    error: new Error('test error'),
    providerId: 'google' as never,
    bareModelId: 'gemini-2.5-flash',
    ...overrides,
  };
}

function baseArgs(overrides?: Partial<RetryLoopArgs<string>>): RetryLoopArgs<string> {
  return {
    maxAttempts: 3,
    initialModelOverride: undefined,
    userId: 'u1',
    budget: makeBudget(),
    attempt: vi.fn() as RetryLoopArgs<string>['attempt'],
    userSettings: { aiFallbackChain: [] },
    decryptedByokKeys: {},
    env: {},
    routing: { domain: 'technical' } as never,
    ...overrides,
  };
}

describe('runChatWithFallback', () => {
  beforeEach(() => {
    mockClassifyStreamError = vi.fn(() => ({ fallback: false }));
    mockMakeFallbackPart = vi.fn(() => ({ type: 'fallback' as const }));
    mockPickNextFallbackProvider = vi.fn();
  });

  // ── First-attempt success ──

  it('returns the result on first-attempt success', async () => {
    const attempt = vi.fn().mockResolvedValueOnce(makeSuccessResult('hello'));
    const args = baseArgs({ attempt });

    const result = await runChatWithFallback<string>(args);

    expect(result).toBe('hello');
    expect(attempt).toHaveBeenCalledTimes(1);
    expect(attempt).toHaveBeenCalledWith({
      currentModelOverride: undefined,
      nonEssentialDisabled: false,
      attemptNumber: 1,
    });
  });

  // ── Retry after fallback ──

  it('retries after a fallback-classified error and succeeds', async () => {
    mockClassifyStreamError.mockReturnValue({ fallback: true, reason: 'rate-limit' });
    mockPickNextFallbackProvider.mockReturnValue({
      providerId: 'openai',
      modelId: 'gpt-4.1',
    });

    const attempt = vi
      .fn()
      .mockResolvedValueOnce(makeErrorResult())
      .mockResolvedValueOnce(makeSuccessResult('retry-success'));
    const onFallback = vi.fn();
    const args = baseArgs({ attempt, onFallback });

    const result = await runChatWithFallback<string>(args);

    expect(result).toBe('retry-success');
    expect(attempt).toHaveBeenCalledTimes(2);
    // Second attempt should use the fallback model
    expect(attempt).toHaveBeenNthCalledWith(2, {
      currentModelOverride: 'openai:gpt-4.1',
      nonEssentialDisabled: false,
      attemptNumber: 2,
    });
    expect(onFallback).toHaveBeenCalledTimes(1);
  });

  // ── Exhausts maxAttempts ──

  it('throws after exhausting maxAttempts', async () => {
    mockClassifyStreamError.mockReturnValue({ fallback: true, reason: 'rate-limit' });
    mockPickNextFallbackProvider.mockReturnValue({
      providerId: 'openai',
      modelId: 'gpt-4.1',
    });

    const lastErr = new Error('final error');
    const attempt = vi
      .fn()
      .mockResolvedValueOnce(makeErrorResult({ error: new Error('err1') }))
      .mockResolvedValueOnce(makeErrorResult({ error: new Error('err2') }))
      .mockResolvedValueOnce(makeErrorResult({ error: lastErr }));

    const budget = makeBudget();
    const args = baseArgs({ attempt, budget, maxAttempts: 3 });

    await expect(runChatWithFallback(args)).rejects.toThrow('final error');
    expect(attempt).toHaveBeenCalledTimes(3);
    expect(budget.release).toHaveBeenCalledTimes(1);
  });

  // ── Non-retryable error ──

  it('throws immediately on a non-retryable (non-fallback) error', async () => {
    mockClassifyStreamError.mockReturnValue({ fallback: false });
    const err = new Error('non-retryable');
    const attempt = vi.fn().mockResolvedValueOnce(makeErrorResult({ error: err }));
    const budget = makeBudget();
    const args = baseArgs({ attempt, budget });

    await expect(runChatWithFallback(args)).rejects.toThrow('non-retryable');
    expect(attempt).toHaveBeenCalledTimes(1);
    expect(budget.release).toHaveBeenCalledTimes(1);
  });

  // ── Client disconnect ──

  it('releases budget and throws on client disconnect', async () => {
    mockClassifyStreamError.mockReturnValue({ fallback: false });
    const err = new Error('stream error');
    const attempt = vi.fn().mockResolvedValueOnce(makeErrorResult({ error: err }));
    const budget = makeBudget();
    const signal = { aborted: true } as AbortSignal;
    const args = baseArgs({ attempt, budget, signal });

    await expect(runChatWithFallback(args)).rejects.toThrow('stream error');
    expect(budget.release).toHaveBeenCalledTimes(1);
  });

  // ── onFallback callback ──

  it('calls onFallback with the correct fallback info', async () => {
    mockClassifyStreamError.mockReturnValue({ fallback: true, reason: 'rate-limit' });
    mockPickNextFallbackProvider.mockReturnValue({
      providerId: 'anthropic',
      modelId: 'claude-sonnet-4',
    });
    mockMakeFallbackPart.mockReturnValue({ type: 'fallback' });

    const attempt = vi
      .fn()
      .mockResolvedValueOnce(makeErrorResult())
      .mockResolvedValueOnce(makeSuccessResult('ok'));
    const onFallback = vi.fn();
    const args = baseArgs({ attempt, onFallback });

    await runChatWithFallback(args);

    expect(onFallback).toHaveBeenCalledTimes(1);
    // Called with the label matching the original model
    expect(onFallback).toHaveBeenCalledWith({ type: 'fallback' });
  });

  // ── Fallback chain exhausts → throws ──

  it('throws when no next fallback provider is available', async () => {
    mockClassifyStreamError.mockReturnValue({ fallback: true, reason: 'rate-limit' });
    mockPickNextFallbackProvider.mockReturnValue(null); // no more fallbacks

    const err = new Error('stream error');
    const attempt = vi.fn().mockResolvedValueOnce(makeErrorResult({ error: err }));
    const budget = makeBudget();
    const args = baseArgs({ attempt, budget });

    await expect(runChatWithFallback(args)).rejects.toThrow('stream error');
  });

  // ── PROVIDER_THRESHOLD_EXCEEDED special case ──

  it('treats PROVIDER_THRESHOLD_EXCEEDED as fallback', async () => {
    const thresholdErr = new Error('PROVIDER_THRESHOLD_EXCEEDED: daily limit');
    mockPickNextFallbackProvider.mockReturnValue({
      providerId: 'anthropic',
      modelId: 'claude-sonnet-4',
    });

    const attempt = vi
      .fn()
      .mockResolvedValueOnce(makeErrorResult({ error: thresholdErr }))
      .mockResolvedValueOnce(makeSuccessResult('ok'));

    const args = baseArgs({ attempt });

    const result = await runChatWithFallback<string>(args);
    expect(result).toBe('ok');
    expect(attempt).toHaveBeenCalledTimes(2);
  });

  // ── Passes correct attempt context ──

  it('increments attemptNumber across retries', async () => {
    mockClassifyStreamError.mockReturnValue({ fallback: true, reason: 'rate-limit' });
    mockPickNextFallbackProvider.mockReturnValue({ providerId: 'openai', modelId: 'gpt-4.1' });

    const contexts: AttemptContext[] = [];
    const attempt = vi.fn(async (ctx: AttemptContext) => {
      contexts.push({ ...ctx });
      if (contexts.length < 3) return makeErrorResult();
      return makeSuccessResult('ok');
    });

    const args = baseArgs({ attempt, maxAttempts: 3 });

    await runChatWithFallback(args);

    expect(contexts).toHaveLength(3);
    expect(contexts[0]!.attemptNumber).toBe(1);
    expect(contexts[1]!.attemptNumber).toBe(2);
    expect(contexts[2]!.attemptNumber).toBe(3);
  });

  // ── currentModelOverride propagates through fallback chain ──

  it('passes initialModelOverride to first attempt', async () => {
    const attempt = vi.fn().mockResolvedValueOnce(makeSuccessResult('ok'));
    const args = baseArgs({ attempt, initialModelOverride: 'openai:gpt-4.1' });

    await runChatWithFallback(args);

    expect(attempt).toHaveBeenCalledWith({
      currentModelOverride: 'openai:gpt-4.1',
      nonEssentialDisabled: false,
      attemptNumber: 1,
    });
  });

  // ── nonEssentialDisabled propagates ──

  it('carries forward nonEssentialDisabled from attempt result', async () => {
    mockClassifyStreamError.mockReturnValue({ fallback: true, reason: 'rate-limit' });
    mockPickNextFallbackProvider.mockReturnValue({ providerId: 'openai', modelId: 'gpt-4.1' });

    const attempt = vi
      .fn()
      .mockResolvedValueOnce(makeErrorResult({ nonEssentialDisabled: true }))
      .mockResolvedValueOnce(makeSuccessResult('ok'));

    const args = baseArgs({ attempt });

    await runChatWithFallback(args);

    expect(attempt).toHaveBeenNthCalledWith(2, {
      currentModelOverride: 'openai:gpt-4.1',
      nonEssentialDisabled: true,
      attemptNumber: 2,
    });
  });
});
