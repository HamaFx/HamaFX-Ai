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

// Per-provider rolling health snapshot.
//
// `runWithFailover` consults this so it doesn't always retry a provider that
// has been failing for the last few minutes. The data structure is a tiny
// circular buffer per provider — no allocations on the hot path, no upstream
// dep, fits the personal-mode "no Upstash" rule.
//
// Health windows are short (5 min default) so a single bad minute doesn't
// permanently sideline a provider — it self-heals on the next success.
//
// Phase 2 hardening §6 — scope: this state is per-Lambda-instance.
//
// On Vercel each function instance owns its own copy; a provider that
// fails on instance A may still look healthy to instance B for a few
// minutes. The pre-fix concern was that this divergence let one
// instance prefer a degraded provider. With Phase 2 §2 in place
// (pinned providers + ProviderEmptyError), the only providers that
// flap between instances are biquote-rest and finnhub — both REST and
// similar latency, so the residual user impact is negligible. The
// pinned mechanism is the production lever for "I always want X
// first"; this scoring is only the tiebreaker between unpinned
// alternatives.
//
// If we ever need cross-instance consistency (e.g. shared "back off
// from biquote for 5 min"), promote this to a Postgres-backed counter
// behind the same `recordSuccess` / `recordFailure` API.

const WINDOW_MS = 5 * 60 * 1000;

interface Sample {
  /** ms epoch UTC. */
  t: number;
  ok: boolean;
}

interface State {
  samples: Sample[];
}

const state = new Map<string, State>();

function s(provider: string): State {
  let st = state.get(provider);
  if (!st) {
    st = { samples: [] };
    state.set(provider, st);
  }
  return st;
}

function trim(st: State, now: number): void {
  const cutoff = now - WINDOW_MS;
  // The list is appended chronologically; drop the head until first in-window.
  let i = 0;
  while (i < st.samples.length && st.samples[i]!.t < cutoff) i += 1;
  if (i > 0) st.samples.splice(0, i);
}

/**
 * Count consecutive trailing failures. Returns 0 when the last sample
 * is a success or there are no samples.
 */
function consecutiveFailures(st: State): number {
  let count = 0;
  for (let i = st.samples.length - 1; i >= 0; i--) {
    if (!st.samples[i]!.ok) count += 1;
    else break;
  }
  return count;
}

export function recordSuccess(provider: string): void {
  const now = Date.now();
  const st = s(provider);
  st.samples.push({ t: now, ok: true });
  trim(st, now);
}

export function recordFailure(provider: string): void {
  const now = Date.now();
  const st = s(provider);
  st.samples.push({ t: now, ok: false });
  trim(st, now);
}

export interface HealthSnapshot {
  /** Number of samples in the current 5-minute window. */
  samples: number;
  /** Successes in window. */
  ok: number;
  /** Failures in window. */
  failed: number;
  /** Failure rate in window. 0 when no samples (= "unknown, treat as healthy"). */
  failureRate: number;
}

export function getHealth(provider: string): HealthSnapshot {
  const now = Date.now();
  const st = s(provider);
  trim(st, now);
  let ok = 0;
  let failed = 0;
  for (const e of st.samples) {
    if (e.ok) ok += 1;
    else failed += 1;
  }
  const total = ok + failed;
  return {
    samples: total,
    ok,
    failed,
    failureRate: total === 0 ? 0 : failed / total,
  };
}

/**
 * Score a provider for failover ordering. Higher = healthier.
 *
 * Uses exponential decay: each consecutive trailing failure doubles its
 * weight, so a burst of 5 consecutive failures penalises the provider
 * much harder than 5 failures scattered across 50 successes.
 *
 *  - Unknown (no samples): neutral 0.5 — give it a chance.
 *  - Mostly fresh successes: ~1.0.
 *  - Consecutive failures: drops toward 0 exponentially so the failover
 *    chain quickly bypasses a provider that has entered a persistent
 *    failure state (e.g. closed market, expired API key).
 *
 * `runWithFailover` sorts attempts by score descending while preserving
 * the caller-provided order on ties.
 */
export function getScore(provider: string): number {
  const st = s(provider);
  const now = Date.now();
  trim(st, now);

  if (st.samples.length === 0) return 0.5;

  const consec = consecutiveFailures(st);
  let weightedFailures = 0;
  let weightedTotal = 0;

  for (let idx = 0; idx < st.samples.length; idx++) {
    const sample = st.samples[idx]!;
    weightedTotal += 1;
    if (!sample.ok) {
      // Penalty is 2^{consecutive position from the end} so recent
      // consecutive failures dominate the score. A single isolated
      // failure counts as 1; 3 consecutive failures count as 1+2+4=7.
      const positionFromEnd = st.samples.length - 1 - idx;
      const distance = Math.max(0, consec - positionFromEnd - 1);
      weightedFailures += Math.pow(2, distance);
    }
  }

  const failureRate = weightedFailures / weightedTotal;
  return Math.max(0, 1 - failureRate);
}

/** Test helper. */
export function _resetHealth(): void {
  state.clear();
}
