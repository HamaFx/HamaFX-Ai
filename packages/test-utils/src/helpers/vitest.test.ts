import { describe, expect, it, afterEach, vi } from 'vitest';
import {
  setupTestEnvironment,
  teardownTestEnvironment,
  freezeTime,
  advanceTime,
  useFakeTimers,
  useRealTimers,
  installServerOnlyStub,
} from './vitest';

describe('setupTestEnvironment', () => {
  afterEach(() => {
    delete process.env.TEST_VAR_A;
    delete process.env.TEST_VAR_B;
  });

  it('sets environment variables from an object', () => {
    setupTestEnvironment({ TEST_VAR_A: 'alpha', TEST_VAR_B: 'beta' });
    expect(process.env.TEST_VAR_A).toBe('alpha');
    expect(process.env.TEST_VAR_B).toBe('beta');
  });

  it('does nothing when env is undefined', () => {
    setupTestEnvironment(undefined);
    // Should not throw
  });

  it('does nothing when env is empty', () => {
    setupTestEnvironment({});
    // Should not throw
  });
});

describe('teardownTestEnvironment', () => {
  it('deletes specified environment variables', () => {
    process.env.DELETE_ME = 'value';
    process.env.KEEP_ME = 'keep';

    teardownTestEnvironment(['DELETE_ME']);

    expect(process.env.DELETE_ME).toBeUndefined();
    expect(process.env.KEEP_ME).toBe('keep');

    delete process.env.KEEP_ME;
  });

  it('does nothing when keys is undefined', () => {
    teardownTestEnvironment(undefined);
    // Should not throw
  });

  it('does nothing when keys is empty', () => {
    teardownTestEnvironment([]);
    // Should not throw
  });
});

describe('freezeTime', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('sets system time to the given epoch', () => {
    vi.useFakeTimers();
    freezeTime(1_700_000_000_000);
    expect(Date.now()).toBe(1_700_000_000_000);
  });
});

describe('advanceTime', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('advances fake timers by the given number of ms', () => {
    vi.useFakeTimers();
    const start = Date.now();
    advanceTime(5_000);
    expect(Date.now()).toBe(start + 5_000);
  });
});

describe('useFakeTimers / useRealTimers', () => {
  afterEach(() => {
    // Safety net — always restore real timers
    vi.useRealTimers();
  });

  it('useFakeTimers enables fake timers', () => {
    useFakeTimers();
    const before = Date.now();
    // Fast-forwarding should not affect real time
    vi.advanceTimersByTime(10_000);
    expect(Date.now()).toBe(before + 10_000);
  });

  it('useRealTimers restores real timers', () => {
    useFakeTimers();
    useRealTimers();
    // Should not throw when using real Date.now
    const now = Date.now();
    expect(typeof now).toBe('number');
    expect(now).toBeGreaterThan(0);
  });
});

describe('installServerOnlyStub', () => {
  it('installs the server-only mock without throwing', () => {
    expect(() => installServerOnlyStub()).not.toThrow();
  });
});
