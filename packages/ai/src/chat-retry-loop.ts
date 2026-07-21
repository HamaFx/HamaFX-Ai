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

// SRP-1 — Retry/fallback loop executor, extracted from agent.ts.
//
// runChatInner's ~500-line while loop owned five shared mutable locals
// (attempts, lastError, currentModelOverride, nonEssentialDisabled,
// checkedProviders). This module encapsulates those into loop-local state
// and delegates each attempt to a caller-provided callback.
//
// The loop handles: attempt counting, error classification, fallback-chain
// navigation, budget release guards, and post-loop cleanup. The attempt
// body (model resolution, planning, streaming) stays in agent.ts as a
// callback — not abstracted away.

import { pickNextFallbackProvider } from './model-resolution';
import {
  classifyStreamError,
  makeFallbackPart,
  type FallbackPartPayload,
} from './fallback';
import type { BudgetHandle } from './budget-reservation';
import type { ProviderId } from '@hamafx/shared/encryption';
import type { RoutingDecision } from './routing';
import { createCategorizedLogger } from '@hamafx/shared/logger';

const alog = createCategorizedLogger('ai', { component: 'retry-loop' });

// ── Types ──────────────────────────────────────────────────────────────

/** Context passed to the attempt callback on each iteration. */
export interface AttemptContext {
  /** The current model override (changes during fallback chain). */
  currentModelOverride: string | undefined;
  /** Whether non-essential features are disabled (set by budget alerts). */
  nonEssentialDisabled: boolean;
  /** The current attempt number (1-based). */
  attemptNumber: number;
}

/** Returned by the attempt callback. */
export interface AttemptResult<T = unknown> {
  success: boolean;
  /** When success=true, the stream result to return to the caller. */
  value?: T | undefined;
  /** When success=false, the error from this attempt. */
  error?: unknown;
  /**
   * The providerId resolved for this attempt (used by the loop to
   * navigate the fallback chain on failure).
   */
  providerId?: ProviderId | undefined;
  /**
   * The bare model ID (without provider prefix) — used in fallback
   * part labels.
   */
  bareModelId?: string | undefined;
  /**
   * Updated nonEssentialDisabled from model resolution (may have been
   * changed by budget-alert checks).
   */
  nonEssentialDisabled?: boolean | undefined;
}

export interface RetryLoopArgs<T = unknown> {
  /** Maximum number of attempts (currently 5). */
  maxAttempts: number;
  /** Initial model override from the user (may be undefined). */
  initialModelOverride: string | undefined;
  /** User ID for budget operations. */
  userId: string;
  /** Budget handle for release on non-retryable errors. */
  budget: BudgetHandle;
  /** Per-attempt callback — does model resolution + streaming. */
  attempt: (ctx: AttemptContext) => Promise<AttemptResult<T>>;
  /** Called when a fallback is triggered, so the caller can build a fallback part. */
  onFallback?: (info: FallbackPartPayload) => void;
  /** AbortSignal for client disconnect detection. */
  signal?: AbortSignal | null | undefined;
  /** User settings (for fallback chain). */
  userSettings: { aiFallbackChain?: unknown };
  /** Decrypted BYOK keys (for fallback provider resolution). */
  decryptedByokKeys: unknown;
  /** Env for Google API key fallback. */
  env: { GOOGLE_GENERATIVE_AI_API_KEY?: string | undefined };
  /** The routing decision for this turn (domain for fallback). */
  routing: RoutingDecision;
}

// ── Loop ───────────────────────────────────────────────────────────────

/**
 * Execute the chat turn with up to `maxAttempts` attempts, navigating
 * the fallback chain on transient errors. Returns the stream result
 * on success; throws on non-retryable error or when all attempts are
 * exhausted.
 */
export async function runChatWithFallback<T>(args: RetryLoopArgs<T>): Promise<T> {
  let attempts = 0;
  let lastError: unknown = null;
  let currentModelOverride = args.initialModelOverride;
  let nonEssentialDisabled = false;
  let providerId: ProviderId | undefined;
  let bareModelId: string | undefined;

  while (attempts < args.maxAttempts) {
    attempts++;
    providerId = undefined;
    bareModelId = undefined;

    const attemptResult = await args.attempt({
      currentModelOverride,
      nonEssentialDisabled,
      attemptNumber: attempts,
    });

    if (attemptResult.success) {
      return attemptResult.value as T;
    }

    // ── Update mutable state from attempt result ──
    lastError = attemptResult.error;
    if (attemptResult.providerId !== undefined) providerId = attemptResult.providerId;
    if (attemptResult.bareModelId !== undefined) bareModelId = attemptResult.bareModelId;
    if (attemptResult.nonEssentialDisabled !== undefined) {
      nonEssentialDisabled = attemptResult.nonEssentialDisabled;
    }

    // ── Client disconnect — no retry ──
    if (args.signal?.aborted) {
      await args.budget.release();
      throw lastError;
    }

    // ── Classify error ──
    const isProviderThresholdErr =
      lastError instanceof Error && lastError.message.startsWith('PROVIDER_THRESHOLD_EXCEEDED');
    const decision = isProviderThresholdErr
      ? { fallback: true, reason: 'rate-limit' as const, message: (lastError as Error).message }
      : classifyStreamError(lastError);

    if (!decision.fallback) {
      // STAB-02: Release budget reservation on non-retryable error.
      await args.budget.release();
      throw lastError;
    }

    // ── Fallback! Pick the next provider in the chain ──
    const currentProvider = providerId ??
      ((typeof currentModelOverride === 'string' && currentModelOverride.length > 0)
        ? (currentModelOverride.includes(':') ? currentModelOverride.split(':')[0] : currentModelOverride)
        : 'google') as ProviderId;

    const fallbackChain = (args.userSettings.aiFallbackChain as string[] | undefined) ?? [];
    const nextFallback = pickNextFallbackProvider(
      fallbackChain,
      currentProvider,
      args.decryptedByokKeys as Parameters<typeof pickNextFallbackProvider>[2],
      args.env.GOOGLE_GENERATIVE_AI_API_KEY,
      args.routing.domain,
    );

    if (!nextFallback) {
      throw lastError;
    }

    alog.warn('Fallback triggered', {
      attempts,
      provider: String(providerId),
      reason: decision.reason,
      message: decision.message,
      nextProvider: nextFallback.providerId,
    });

    // Build fallback part for the UI.
    // When model resolution itself failed, neither providerId nor bareModelId
    // are set — use 'auto' as the label (matches original behaviour).
    // When streaming failed after resolution, use the resolved model id.
    const fallbackLabel = (providerId && bareModelId)
      ? (currentModelOverride ?? `${providerId}:${bareModelId}`)
      : (currentModelOverride ?? 'auto');
    const fallbackInfo = makeFallbackPart(fallbackLabel, decision);
    args.onFallback?.(fallbackInfo);

    currentModelOverride = nextFallback.modelId
      ? `${nextFallback.providerId}:${nextFallback.modelId}`
      : nextFallback.providerId;
  }

  // All retry attempts exhausted — release the budget reservation.
  await args.budget.release();
  throw lastError ?? new Error('All fallback attempts failed');
}
