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

// Phase 4.4: Chaos / failure injection tests for the data package's
// failover and circuit-breaker infrastructure.
//
// Scenarios covered:
//   1. Provider failover on HTTP 500 (PROVIDER_HTTP_ERROR)
//   2. Provider failover on timeout (PROVIDER_TIMEOUT)
//   3. Circuit-breaker open/close behaviour integrated with failover

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ProviderError } from '../src/errors';
import { _resetHealth } from '../src/health';
import { runWithFailover } from '../src/failover';
import { _resetAllBreakers, getCircuitBreaker } from '../src/circuit-breaker';

beforeEach(() => {
  _resetHealth();
  _resetAllBreakers();
});

// ---------------------------------------------------------------------------
// Provider failover — HTTP 500
// ---------------------------------------------------------------------------

describe('chaos: failover on HTTP 500', () => {
  it('falls back when primary returns HTTP 500', async () => {
    const out = await runWithFailover([
      {
        name: 'twelve-data',
        run: async () => {
          throw new ProviderError('PROVIDER_HTTP_ERROR', 'twelve-data', 'HTTP 500 Internal Server Error', { status: 500 });
        },
      },
      {
        name: 'finnhub',
        run: async () => 'fallback-ok',
      },
    ]);

    expect(out).toEqual({ value: 'fallback-ok', provider: 'finnhub' });
  });

  it('rethrows when all providers return HTTP 500', async () => {
    await expect(
      runWithFailover([
        {
          name: 'twelve-data',
          run: async () => {
            throw new ProviderError('PROVIDER_HTTP_ERROR', 'twelve-data', 'HTTP 500', { status: 500 });
          },
        },
        {
          name: 'finnhub',
          run: async () => {
            throw new ProviderError('PROVIDER_HTTP_ERROR', 'finnhub', 'HTTP 500', { status: 500 });
          },
        },
      ]),
    ).rejects.toThrow('HTTP 500');
  });

  it('rethrows with the first provider error when all have same rank', async () => {
    await expect(
      runWithFailover([
        {
          name: 'twelve-data',
          run: async () => {
            throw new ProviderError('PROVIDER_HTTP_ERROR', 'twelve-data', 'primary-500', { status: 500 });
          },
        },
        {
          name: 'finnhub',
          run: async () => {
            throw new ProviderError('PROVIDER_HTTP_ERROR', 'finnhub', 'secondary-500', { status: 502 });
          },
        },
      ]),
    ).rejects.toThrow('primary-500');
  });

  it('retries the healthy provider after primary recovers (health not tainted across calls)', async () => {
    // Primary fails once, fallback succeeds. Health recorded.
    const out1 = await runWithFailover([
      {
        name: 'twelve-data',
        run: async () => {
          throw new ProviderError('PROVIDER_HTTP_ERROR', 'twelve-data', 'down', { status: 500 });
        },
      },
      {
        name: 'finnhub',
        run: async () => 'A',
      },
    ]);
    expect(out1.provider).toBe('finnhub');

    // Second call: primary health was dinged by the failure, so finnhub
    // (still at neutral 0.5) is tried first.
    const out2 = await runWithFailover([
      {
        name: 'twelve-data',
        run: async () => 'B',
      },
      {
        name: 'finnhub',
        run: async () => 'C',
      },
    ]);
    expect(out2.provider).toBe('finnhub');
    expect(out2.value).toBe('C');
  });
});

// ---------------------------------------------------------------------------
// Provider failover — timeout
// ---------------------------------------------------------------------------

describe('chaos: failover on timeout', () => {
  it('falls back when primary times out', async () => {
    const out = await runWithFailover([
      {
        name: 'twelve-data',
        run: async () => {
          throw new ProviderError('PROVIDER_TIMEOUT', 'twelve-data', 'upstream timed out');
        },
      },
      {
        name: 'finnhub',
        run: async () => 'timeout-fallback-ok',
      },
    ]);

    expect(out).toEqual({ value: 'timeout-fallback-ok', provider: 'finnhub' });
  });

  it('prefers quota error over timeout error when all fail', async () => {
    await expect(
      runWithFailover([
        {
          name: 'twelve-data',
          run: async () => {
            throw new ProviderError('PROVIDER_TIMEOUT', 'twelve-data', 'timeout');
          },
        },
        {
          name: 'finnhub',
          run: async () => {
            throw new ProviderError('PROVIDER_QUOTA_EXCEEDED', 'finnhub', 'quota exceeded');
          },
        },
      ]),
    ).rejects.toThrow('quota exceeded');
  });

  it('surfaces timeout error when no higher-rank error exists', async () => {
    await expect(
      runWithFailover([
        {
          name: 'twelve-data',
          run: async () => {
            throw new ProviderError('PROVIDER_TIMEOUT', 'twelve-data', 't1 timeout');
          },
        },
        {
          name: 'finnhub',
          run: async () => {
            throw new ProviderError('PROVIDER_TIMEOUT', 'finnhub', 't2 timeout');
          },
        },
      ]),
    ).rejects.toThrow('t1 timeout');
  });

  it('tolerates mix of timeout and HTTP error and rethrows highest rank', async () => {
    // Both same rank (2), so first wins.
    await expect(
      runWithFailover([
        {
          name: 'twelve-data',
          run: async () => {
            throw new ProviderError('PROVIDER_TIMEOUT', 'twelve-data', 'timeout', { status: 0 });
          },
        },
        {
          name: 'finnhub',
          run: async () => {
            throw new ProviderError('PROVIDER_HTTP_ERROR', 'finnhub', 'http 503', { status: 503 });
          },
        },
      ]),
    ).rejects.toThrow('timeout');
  });
});

// ---------------------------------------------------------------------------
// Circuit-breaker open/close behaviour
// ---------------------------------------------------------------------------

describe('chaos: circuit-breaker open/close', () => {
  it('passes calls through when CLOSED', async () => {
    const cb = getCircuitBreaker('chaos-test', { failureThreshold: 3, openDurationMs: 60_000 });
    const fn = vi.fn().mockResolvedValue('ok');
    const result = await cb.call(fn);
    expect(result).toBe('ok');
    expect(cb.state).toBe('CLOSED');
  });

  it('opens after reaching failure threshold', async () => {
    const cb = getCircuitBreaker('open-test', { failureThreshold: 2, openDurationMs: 60_000 });
    const fail = vi.fn().mockRejectedValue(new Error('boom'));

    for (let i = 0; i < 2; i++) {
      await expect(cb.call(fail)).rejects.toThrow('boom');
    }
    expect(cb.state).toBe('OPEN');
  });

  it('fails fast when OPEN without calling the wrapped function', async () => {
    const cb = getCircuitBreaker('fast-fail', { failureThreshold: 1, openDurationMs: 60_000 });
    await expect(cb.call(vi.fn().mockRejectedValue(new Error('x')))).rejects.toThrow();
    expect(cb.state).toBe('OPEN');

    const spy = vi.fn().mockResolvedValue('never');
    await expect(cb.call(spy)).rejects.toThrow('circuit-breaker');
    expect(spy).not.toHaveBeenCalled();
  });

  it('resets failure count on success while CLOSED', async () => {
    const cb = getCircuitBreaker('reset-count', { failureThreshold: 3, openDurationMs: 60_000 });
    const fail = vi.fn().mockRejectedValue(new Error('fail'));
    const ok = vi.fn().mockResolvedValue('ok');

    await expect(cb.call(fail)).rejects.toThrow('fail');
    await expect(cb.call(fail)).rejects.toThrow('fail');
    await cb.call(ok); // resets counter
    await expect(cb.call(fail)).rejects.toThrow('fail');
    expect(cb.state).toBe('CLOSED'); // still CLOSED — counter was reset
  });

  it('transitions OPEN → HALF_OPEN → CLOSED on successful probes', async () => {
    const cb = getCircuitBreaker('half-open-recover', {
      failureThreshold: 2,
      openDurationMs: 0,
      halfOpenSuccessThreshold: 2,
    });

    const fail = vi.fn().mockRejectedValue(new Error('fail'));
    for (let i = 0; i < 2; i++) {
      await expect(cb.call(fail)).rejects.toThrow();
    }
    expect(cb.state).toBe('OPEN');

    // openDurationMs=0 → next call becomes HALF_OPEN probe
    const ok = vi.fn().mockResolvedValue('probe1');
    await cb.call(ok);
    expect(cb.state).toBe('HALF_OPEN');

    await cb.call(ok);
    expect(cb.state).toBe('CLOSED');
  });

  it('re-opens on failure during HALF_OPEN', async () => {
    const cb = getCircuitBreaker('re-open-half', {
      failureThreshold: 1,
      openDurationMs: 0,
      halfOpenSuccessThreshold: 2,
    });

    await expect(cb.call(vi.fn().mockRejectedValue(new Error('x')))).rejects.toThrow();
    expect(cb.state).toBe('OPEN');

    // openDurationMs=0 → HALF_OPEN probe. This probe fails → re-opens.
    await expect(cb.call(vi.fn().mockRejectedValue(new Error('probe fail')))).rejects.toThrow();
    expect(cb.state).toBe('OPEN');
  });

  it('remains OPEN until openDurationMs elapses', async () => {
    const cb = getCircuitBreaker('duration-test', {
      failureThreshold: 1,
      openDurationMs: 10_000,
    });

    await expect(cb.call(vi.fn().mockRejectedValue(new Error('x')))).rejects.toThrow();
    expect(cb.state).toBe('OPEN');

    // Should still be OPEN (timer hasn't elapsed).
    await expect(cb.call(vi.fn().mockResolvedValue('never'))).rejects.toThrow('circuit-breaker');
    expect(cb.state).toBe('OPEN');
  });

  it('reset() restores CLOSED state from OPEN', async () => {
    const cb = getCircuitBreaker('reset-test', {
      failureThreshold: 1,
      openDurationMs: 60_000,
    });

    await expect(cb.call(vi.fn().mockRejectedValue(new Error('x')))).rejects.toThrow();
    expect(cb.state).toBe('OPEN');

    cb.reset();
    expect(cb.state).toBe('CLOSED');

    const result = await cb.call(vi.fn().mockResolvedValue('restored'));
    expect(result).toBe('restored');
  });

  // ── Integration: failover with circuit breaker ──────────────────────

  it('integration: breaker wraps a provider in failover — opens after repeated failures', async () => {
    const breaker = getCircuitBreaker('failover-provider', {
      failureThreshold: 2,
      openDurationMs: 60_000,
    });

    // Provider that always fails.
    const provider = async () => {
      throw new ProviderError('PROVIDER_HTTP_ERROR', 'failover-provider', 'down', { status: 500 });
    };

    // Run through breaker twice → opens on second failure.
    for (let i = 0; i < 2; i++) {
      await expect(breaker.call(provider)).rejects.toThrow('down');
    }
    expect(breaker.state).toBe('OPEN');

    // Now this provider is dead. In a real failover it would be skipped.
    // The breaker fails fast.
    await expect(breaker.call(provider)).rejects.toThrow('circuit-breaker');
  });

  it('integration: failover skips OPEN provider when circuit breaker is consulted externally', async () => {
    // Simulate: an adapter checks circuit breaker before calling failover.
    // When the breaker is OPEN, the adapter converts this to a ProviderError
    // so runWithFailover can fall through to the next provider.
    const breaker = getCircuitBreaker('broken-provider', {
      failureThreshold: 1,
      openDurationMs: 60_000,
    });

    // First call: provider fails, breaker opens.
    await expect(
      breaker.call(async () => {
        throw new ProviderError('PROVIDER_HTTP_ERROR', 'broken-provider', 'fail', { status: 500 });
      }),
    ).rejects.toThrow('fail');
    expect(breaker.state).toBe('OPEN');

    // Second "failover" attempt: adapter sees OPEN breaker and converts
    // to ProviderError so failover proceeds to fallback.
    let fallbackCalled = false;
    const result = await runWithFailover([
      {
        name: 'broken-provider',
        run: async () => {
          if (breaker.state === 'OPEN') {
            throw new ProviderError('PROVIDER_HTTP_ERROR', 'broken-provider', 'circuit open', { status: 503 });
          }
          return breaker.call(async () => 'should-not-happen');
        },
      },
      {
        name: 'healthy-fallback',
        run: async () => {
          fallbackCalled = true;
          return 'fallback-result';
        },
      },
    ]);

    expect(result.value).toBe('fallback-result');
    expect(result.provider).toBe('healthy-fallback');
    expect(fallbackCalled).toBe(true);
  });

  it('integration: failover proceeds with fallback when primary circuit breaker is OPEN', async () => {
    const breaker = getCircuitBreaker('primary-service', {
      failureThreshold: 2,
      openDurationMs: 60_000,
    });

    // Trip the breaker.
    for (let i = 0; i < 2; i++) {
      await expect(
        breaker.call(async () => {
          throw new ProviderError('PROVIDER_HTTP_ERROR', 'primary-service', 'down', { status: 500 });
        }),
      ).rejects.toThrow();
    }
    expect(breaker.state).toBe('OPEN');

    // When used in a failover with the breaker check:
    let secondaryUsed = false;
    const result = await runWithFailover([
      {
        name: 'primary-service',
        run: async () => {
          if (breaker.state === 'OPEN') {
            throw new ProviderError('PROVIDER_HTTP_ERROR', 'primary-service', 'circuit open', { status: 503 });
          }
          return await breaker.call(async () => 'primary-data');
        },
      },
      {
        name: 'secondary-service',
        run: async () => {
          secondaryUsed = true;
          return 'secondary-data';
        },
      },
    ]);

    expect(result.value).toBe('secondary-data');
    expect(result.provider).toBe('secondary-service');
    expect(secondaryUsed).toBe(true);
  });
});
