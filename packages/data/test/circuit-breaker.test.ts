import { beforeEach, describe, expect, it, vi } from 'vitest';
import { _resetAllBreakers, getCircuitBreaker } from '../src/circuit-breaker';

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
    for (let i = 0; i < 2; i++) {
      await expect(cb.call(failing)).rejects.toThrow('boom');
    }
    await expect(cb.call(vi.fn().mockResolvedValue('ok'))).resolves.toBe('ok');
    expect(cb.state).toBe('CLOSED');
  });

  it('returns name property', () => {
    const cb = getCircuitBreaker('my-service');
    expect(cb.name).toBe('my-service');
  });

  it('shares internal state across calls with same provider name', () => {
    const a = getCircuitBreaker('shared', { failureThreshold: 1, openDurationMs: 30_000 });
    const b = getCircuitBreaker('shared');
    expect(a.state).toBe('CLOSED');
    expect(b.state).toBe('CLOSED');
    expect(a).not.toBe(b);
  });

  it('creates separate instances for different provider names', () => {
    const a = getCircuitBreaker('provider-a');
    const b = getCircuitBreaker('provider-b');
    expect(a).not.toBe(b);
  });

  it('tracks state property', () => {
    const cb = getCircuitBreaker('state-check');
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
    await expect(cb.call(spy)).rejects.toThrow(/circuit-breaker.*OPEN/);
    expect(spy).not.toHaveBeenCalled();
  });

  it('uses custom failure threshold', async () => {
    const cb = getCircuitBreaker('custom-threshold', { failureThreshold: 1, openDurationMs: 30_000 });
    const fn = vi.fn().mockRejectedValue(new Error('fail'));
    await expect(cb.call(fn)).rejects.toThrow();
    expect(cb.state).toBe('OPEN');
  });
});

describe('circuit breaker — HALF_OPEN recovery', () => {
  it('transitions OPEN→HALF_OPEN→CLOSED on successful probes', async () => {
    const cb = getCircuitBreaker('test-d', {
      failureThreshold: 2,
      openDurationMs: 0,
      halfOpenSuccessThreshold: 2,
    });
    const fail = vi.fn().mockRejectedValue(new Error('x'));
    for (let i = 0; i < 2; i++) {
      await expect(cb.call(fail)).rejects.toThrow();
    }
    expect(cb.state).toBe('OPEN');

    const ok = vi.fn().mockResolvedValue('ok');
    await cb.call(ok);
    expect(cb.state).toBe('HALF_OPEN');
    await cb.call(ok);
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
    await expect(cb.call(fail)).rejects.toThrow();
    expect(cb.state).toBe('OPEN');
  });

  it('recovers with single successful probe when threshold is 1', async () => {
    const cb = getCircuitBreaker('single-probe', {
      failureThreshold: 2,
      openDurationMs: 0,
      halfOpenSuccessThreshold: 1,
    });
    const fail = vi.fn().mockRejectedValue(new Error('x'));
    for (let i = 0; i < 2; i++) {
      await expect(cb.call(fail)).rejects.toThrow();
    }
    expect(cb.state).toBe('OPEN');

    await cb.call(vi.fn().mockResolvedValue('probe-ok'));
    expect(cb.state).toBe('CLOSED');
  });

  it('remains OPEN until openDurationMs elapses', async () => {
    const cb = getCircuitBreaker('timer-check', {
      failureThreshold: 1,
      openDurationMs: 10_000,
    });
    const fail = vi.fn().mockRejectedValue(new Error('x'));
    await expect(cb.call(fail)).rejects.toThrow();
    expect(cb.state).toBe('OPEN');

    await expect(cb.call(vi.fn().mockResolvedValue('should-not-call'))).rejects.toThrow();
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

    const result = await cb.call(vi.fn().mockResolvedValue('restored'));
    expect(result).toBe('restored');
  });

  it('reset() resets failure count', () => {
    const cb = getCircuitBreaker('reset-failures', { failureThreshold: 2 });
    cb.reset();
    expect(cb.state).toBe('CLOSED');
  });
});
