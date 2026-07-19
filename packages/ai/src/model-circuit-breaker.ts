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

// M4 (RELIABILITY_AUDIT_REPORT.md) — Per-model circuit breaker.
//
// When a model returns repeated failures (3 consecutive 5xx or timeout
// errors within a 60-second window), the circuit opens and the model is
// temporarily skipped during routing. This prevents degraded models from
// consuming retry budget and user time. The circuit auto-closes after
// 30 seconds, and a single success resets the failure counter immediately.
//
// This is in-memory only (per Vercel instance). A shared circuit breaker
// would require the provider_health table approach from H1.

interface CircuitState {
  consecutiveFailures: number;
  openedAt: number;
}

const circuits = new Map<string, CircuitState>();

/** Number of consecutive failures before the circuit opens. */
const FAILURE_THRESHOLD = 3;

/** How long the circuit stays open (ms) before auto-closing. */
const OPEN_DURATION_MS = 30_000;

/** Window for counting consecutive failures (ms). */
const WINDOW_MS = 60_000;

/**
 * Record a successful model call. Resets the circuit immediately.
 */
export function recordModelSuccess(modelId: string): void {
  circuits.delete(modelId);
}

/**
 * Record a failed model call. Returns true if the circuit is now open
 * and the model should be skipped for subsequent calls.
 */
export function recordModelFailure(modelId: string): boolean {
  const now = Date.now();
  let state = circuits.get(modelId);

  if (!state || now - state.openedAt > WINDOW_MS) {
    // Fresh state or old state expired — start a new window.
    state = { consecutiveFailures: 1, openedAt: now };
    circuits.set(modelId, state);
    return false;
  }

  state.consecutiveFailures += 1;

  if (state.consecutiveFailures >= FAILURE_THRESHOLD) {
    // Circuit opens — the caller should skip this model.
    return true;
  }

  return false;
}

/**
 * Check whether a model's circuit is currently open (should be skipped).
 * Auto-closes if the open duration has elapsed.
 */
export function isCircuitOpen(modelId: string): boolean {
  const state = circuits.get(modelId);
  if (!state) return false;
  if (state.consecutiveFailures < FAILURE_THRESHOLD) return false;

  const now = Date.now();
  if (now - state.openedAt > OPEN_DURATION_MS) {
    // Auto-close — the model gets another chance.
    circuits.delete(modelId);
    return false;
  }

  return true;
}

/** Test helper. */
export function _resetCircuits(): void {
  circuits.clear();
}
