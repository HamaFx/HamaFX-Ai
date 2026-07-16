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

// Phase A RL-3 — Lightweight in-memory LLM rate-limit governor.
//
// Extracts rate-limit signals from provider response headers (already parsed
// by `extractRateLimits`) and uses them to **pre-emptively** gate the next
// call. This is NOT a correctness guarantee (per-instance, fail-open) — it
// is a smoothing optimization that reduces 429s when a single process
// observes a tight quota window.
//
// Key = `${providerId}:${userId}` — per-user-per-provider isolation so one
// user's exhaustion doesn't delay calls for others on the same instance.

import type { RateLimitData } from './rate-limits';

interface ThrottleEntry {
  /** ExactOptionalPropertyTypes-safe: use `| undefined` not `?` */
  remainingRequests: number | undefined;
  remainingTokens: number | undefined;
  /** Epoch ms when the request-level reset expires. */
  resetRequestsMs: number;
  /** Epoch ms when the token-level reset expires. */
  resetTokensMs: number;
}

const store = new Map<string, ThrottleEntry>();

/** Floor: if remaining ≤ this, we consider headroom exhausted. */
const REQUESTS_FLOOR = 0;
const TOKENS_FLOOR = 0;

/** Maximum time we will ever wait (ms) for a rate-limit reset. */
const MAX_WAIT_MS = 5_000;

/**
 * Record the latest rate-limit snapshot from a completed model call.
 * Called from `onFinish` in agent.ts or after `testProviderKey`.
 */
export function noteLlmRateLimit(key: string, data: RateLimitData): void {
  try {
    const now = Date.now();
    const existing = store.get(key);

    store.set(key, {
      remainingRequests: data.remainingRequests,
      remainingTokens: data.remainingTokens,
      resetRequestsMs:
        data.resetRequests !== undefined
          ? parseReset(data.resetRequests, now)
          : existing?.resetRequestsMs ?? 0,
      resetTokensMs:
        data.resetTokens !== undefined
          ? parseReset(data.resetTokens, now)
          : existing?.resetTokensMs ?? 0,
    });
  } catch {
    // Fail-open — this is a soft governor.
  }
}

/**
 * Block (sleep) the calling code if the provider's rate-limit headroom is
 * exhausted. Resolves immediately when headroom is fine.
 *
 * Returns synchronously in most cases (no timer), and never throws.
 * Respects the optional `signal` for cancellation.
 */
export async function awaitLlmHeadroom(
  key: string,
  opts?: { signal?: AbortSignal },
): Promise<void> {
  try {
    const entry = store.get(key);
    if (!entry) return;

    const now = Date.now();
    const signal = opts?.signal;

    // Check requests-level headroom.
    if (entry.remainingRequests !== undefined && entry.remainingRequests <= REQUESTS_FLOOR) {
      if (entry.resetRequestsMs > now) {
        const waitMs = Math.min(entry.resetRequestsMs - now, MAX_WAIT_MS);
        await sleepOrAbort(waitMs, signal);
      }
      // Reset has elapsed — clear stale entry and proceed.
      store.delete(key);
      return;
    }

    // Check token-level headroom.
    if (entry.remainingTokens !== undefined && entry.remainingTokens <= TOKENS_FLOOR) {
      if (entry.resetTokensMs > now) {
        const waitMs = Math.min(entry.resetTokensMs - now, MAX_WAIT_MS);
        await sleepOrAbort(waitMs, signal);
      }
      store.delete(key);
    }
  } catch {
    // Fail-open — never block a chat turn due to a governor bug.
  }
}

/**
 * Parse a reset value into epoch milliseconds.
 *
 * Supports:
 *   - ISO-8601 timestamps (Anthropic: "2026-07-16T12:34:56Z")
 *   - Duration suffixes (OpenAI/Groq: "2.5s", "60ms")
 *   - Bare seconds as a number string ("120")
 */
function parseReset(raw: string, nowMs: number): number {
  // Duration with unit: "2.5s", "60ms"
  const durMatch = raw.trim().match(/^([\d.]+)\s*(s|ms)$/);
  if (durMatch) {
    const val = Number.parseFloat(durMatch[1]!);
    if (!Number.isNaN(val)) {
      const ms = durMatch[2] === 's' ? val * 1000 : val;
      return nowMs + ms;
    }
  }

  // ISO-8601 / HTTP-date: parse via Date.parse
  const parsed = Date.parse(raw);
  if (!Number.isNaN(parsed)) return parsed;

  // Bare integer seconds
  const seconds = Number(raw);
  if (!Number.isNaN(seconds) && String(seconds) === raw.trim()) {
    return nowMs + seconds * 1000;
  }

  return 0;
}

async function sleepOrAbort(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return;
  if (signal?.aborted) return;

  return new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    if (signal) {
      signal.addEventListener(
        'abort',
        () => {
          clearTimeout(timer);
          resolve();
        },
        { once: true },
      );
    }
  });
}
