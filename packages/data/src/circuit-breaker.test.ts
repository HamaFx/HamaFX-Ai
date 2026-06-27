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

// Tests for the circuit breaker (STAB-05).

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { _resetAllBreakers, getCircuitBreaker } from './circuit-breaker';

beforeEach(() => {
  _resetAllBreakers();
});

describe('circuit breaker — CLOSED state', () => {
  it('passes calls through when CLOSED', async () => {
    const cb = getCircuitBreaker('test-provider');
    const fn = vi.fn().mockResolvedValue('ok');
    const result = await cb.call(fn);
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledOnce();
  });

  it('resets failure count on success', async () => {
    const cb = getCircuitBreaker('test-a', { failureThreshold: 3 });
    const failing = vi.fn().mockRejectedValue(new Error('boom'));
    // 2 failures — below threshold
    for (let i = 0; i < 2; i++) {
      await expect(cb.call(failing)).rejects.toThrow('boom');
    }
    // 1 success — resets the streak
    await expect(cb.call(vi.fn().mockResolvedValue('ok'))).resolves.toBe('ok');
    expect(cb.state).toBe('CLOSED');
  });
});

describe('circuit breaker — OPEN state', () => {
  it('opens after threshold failures', async () => {
    const cb = getCircuitBreaker('test-b', { failureThreshold: 3, openDurationMs: 30_000 });
    const failing = vi.fn().mockRejectedValue(new Error('fail'));

    for (let i = 0; i < 3; i++) {
      await expect(cb.call(failing)).rejects.toThrow();
    }
    expect(cb.state).toBe('OPEN');
  });

  it('fails fast when OPEN without calling fn', async () => {
    const cb = getCircuitBreaker('test-c', { failureThreshold: 2, openDurationMs: 60_000 });
    const fn = vi.fn().mockRejectedValue(new Error('fail'));

    for (let i = 0; i < 2; i++) {
      await expect(cb.call(fn)).rejects.toThrow();
    }

    const spy = vi.fn().mockResolvedValue('never');
    await expect(cb.call(spy)).rejects.toMatch(/circuit-breaker.*OPEN/);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('circuit breaker — HALF_OPEN recovery', () => {
  it('transitions OPEN→HALF_OPEN→CLOSED on successful probes', async () => {
    const cb = getCircuitBreaker('test-d', {
      failureThreshold: 2,
      openDurationMs: 0, // immediate recovery for test
      halfOpenSuccessThreshold: 2,
    });
    const fail = vi.fn().mockRejectedValue(new Error('x'));
    for (let i = 0; i < 2; i++) {
      await expect(cb.call(fail)).rejects.toThrow();
    }
    expect(cb.state).toBe('OPEN');

    // openDurationMs=0 means immediately eligible for HALF_OPEN probe.
    const ok = vi.fn().mockResolvedValue('ok');
    await cb.call(ok); // first probe: HALF_OPEN
    expect(cb.state).toBe('HALF_OPEN');
    await cb.call(ok); // second probe: CLOSED
    expect(cb.state).toBe('CLOSED');
  });

  it('re-opens on failure during HALF_OPEN', async () => {
    const cb = getCircuitBreaker('test-e', {
      failureThreshold: 2,
      openDurationMs: 0,
      halfOpenSuccessThreshold: 3,
    });
    const fail = vi.fn().mockRejectedValue(new Error('x'));
    for (let i = 0; i < 2; i++) {
      await expect(cb.call(fail)).rejects.toThrow();
    }
    // Allow probe
    await expect(cb.call(fail)).rejects.toThrow(); // triggers HALF_OPEN then immediately re-opens
    expect(cb.state).toBe('OPEN');
  });
});

describe('circuit breaker — reset()', () => {
  it('reset() moves OPEN → CLOSED', async () => {
    const cb = getCircuitBreaker('test-f', { failureThreshold: 1, openDurationMs: 60_000 });
    await expect(cb.call(vi.fn().mockRejectedValue(new Error()))).rejects.toThrow();
    expect(cb.state).toBe('OPEN');

    cb.reset();
    expect(cb.state).toBe('CLOSED');

    // Should now pass calls through
    const result = await cb.call(vi.fn().mockResolvedValue('restored'));
    expect(result).toBe('restored');
  });
});
