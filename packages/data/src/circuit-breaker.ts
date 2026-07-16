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

// STAB-05: In-process circuit breaker for external API providers.
//
// States:
//   CLOSED  — normal operation, requests pass through.
//   OPEN    — provider is failing; requests fail fast without calling the API.
//   HALF_OPEN — one probe request is allowed to test recovery.
//
// The breaker is keyed by provider name and lives in module-scope memory.
// In serverless environments each worker instance has its own state; this
// is acceptable — the health scoring layer (packages/data/src/health.ts)
// provides cross-instance learning via the DB.
//
// Configuration defaults:
//   FAILURE_THRESHOLD = 5   consecutive failures to trip CLOSED→OPEN
//   OPEN_DURATION_MS  = 30s time to wait before probing in HALF_OPEN
//   HALF_OPEN_SUCCESSES = 2  successful probes to close the breaker
//
// Usage:
//   const cb = getCircuitBreaker('biquote');
//   await cb.call(() => fetchBiquotePrice(...));

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerOptions {
  /** Consecutive failures before opening. Default: 5 */
  failureThreshold?: number;
  /** Milliseconds to stay OPEN before probing. Default: 30_000 */
  openDurationMs?: number;
  /** Consecutive successes in HALF_OPEN before closing. Default: 2 */
  halfOpenSuccessThreshold?: number;
}

export interface CircuitBreaker {
  readonly name: string;
  readonly state: CircuitState;
  /** Execute `fn`. Throws immediately when circuit is OPEN. */
  call<T>(fn: () => Promise<T>): Promise<T>;
  /** Reset the breaker to CLOSED (for testing/admin use). */
  reset(): void;
}

interface BreakerInternal {
  state: CircuitState;
  failures: number;
  halfOpenSuccesses: number;
  openedAt: number | null;
  /** CLEAN-2: Single-flight guard for HALF_OPEN probes. */
  probeInFlight: boolean;
  readonly opts: Required<CircuitBreakerOptions>;
}

// Module-scope registry — one instance per provider name.
const registry = new Map<string, BreakerInternal>();

const DEFAULT_OPTS: Required<CircuitBreakerOptions> = {
  failureThreshold: 5,
  openDurationMs: 30_000,
  halfOpenSuccessThreshold: 2,
};

/**
 * Get or create the circuit breaker for `providerName`.
 * Repeated calls with the same name return the same in-memory instance.
 */
export function getCircuitBreaker(
  providerName: string,
  opts: CircuitBreakerOptions = {},
): CircuitBreaker {
  if (!registry.has(providerName)) {
    registry.set(providerName, {
      state: 'CLOSED',
      failures: 0,
      halfOpenSuccesses: 0,
      openedAt: null,
      probeInFlight: false,
      opts: { ...DEFAULT_OPTS, ...opts },
    });
  }
  const internal = registry.get(providerName)!;

  return {
    get name() { return providerName; },
    get state() { return internal.state; },

    async call<T>(fn: () => Promise<T>): Promise<T> {
      const now = Date.now();

      if (internal.state === 'OPEN') {
        const elapsed = now - (internal.openedAt ?? 0);
        if (elapsed < internal.opts.openDurationMs) {
          // Fail fast without calling the API.
          throw new Error(
            `[circuit-breaker] ${providerName} is OPEN — failing fast ` +
            `(${Math.ceil((internal.opts.openDurationMs - elapsed) / 1000)}s remaining)`,
          );
        }
        // Transition to HALF_OPEN — allow one probe.
        internal.state = 'HALF_OPEN';
        internal.halfOpenSuccesses = 0;
        internal.probeInFlight = false;
      }

      // CLEAN-2: Only one probe at a time in HALF_OPEN.
      // If a probe is already in flight, fail fast without calling fn().
      if (internal.state === 'HALF_OPEN') {
        if (internal.probeInFlight) {
          throw new Error(
            `[circuit-breaker] ${providerName} is HALF_OPEN — probe already in flight`,
          );
        }
        internal.probeInFlight = true;
      }

      try {
        const result = await fn();
        onSuccess(internal, providerName);
        return result;
      } catch (err) {
        onFailure(internal, providerName, now);
        throw err;
      } finally {
        if (internal.state === 'HALF_OPEN') {
          internal.probeInFlight = false;
        }
      }
    },

    reset() {
      internal.state = 'CLOSED';
      internal.failures = 0;
      internal.halfOpenSuccesses = 0;
      internal.openedAt = null;
    },
  };
}

function onSuccess(cb: BreakerInternal, name: string): void {
  if (cb.state === 'HALF_OPEN') {
    cb.halfOpenSuccesses += 1;
    if (cb.halfOpenSuccesses >= cb.opts.halfOpenSuccessThreshold) {
      cb.state = 'CLOSED';
      cb.failures = 0;
      cb.halfOpenSuccesses = 0;
      cb.openedAt = null;
      console.info(`[circuit-breaker] ${name} CLOSED (recovered)`);
    }
  } else {
    // CLOSED: reset failure streak on each success.
    cb.failures = 0;
  }
}

function onFailure(cb: BreakerInternal, name: string, now: number): void {
  cb.failures += 1;
  if (cb.state === 'HALF_OPEN') {
    // Any failure in HALF_OPEN re-opens immediately.
    cb.state = 'OPEN';
    cb.openedAt = now;
    console.warn(`[circuit-breaker] ${name} re-opened (HALF_OPEN probe failed)`);
  } else if (cb.state === 'CLOSED' && cb.failures >= cb.opts.failureThreshold) {
    cb.state = 'OPEN';
    cb.openedAt = now;
    console.warn(`[circuit-breaker] ${name} OPENED after ${cb.failures} failures`);
  }
}

/** Expose registry for testing. */
export function _resetAllBreakers(): void {
  registry.clear();
}
