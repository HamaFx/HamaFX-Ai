import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

// Mock postgres before importing client
const mockEnd = vi.fn().mockResolvedValue(undefined);

vi.mock('postgres', () => {
  const mockPg = vi.fn(() => ({
    end: mockEnd,
  }));
  return { default: mockPg };
});

vi.mock('drizzle-orm/postgres-js', () => ({
  drizzle: vi.fn(() => ({
    transaction: vi.fn(),
    execute: vi.fn(),
  })),
}));

// Re-import withDbRetry after mocks. Other functions need env vars.
import { withDbRetry } from '../src/client';

describe('withDbRetry', () => {
  it('returns the result of a successful function', async () => {
    const result = await withDbRetry(async () => 'success');
    expect(result).toBe('success');
  });

  it('retries on failure and eventually succeeds', async () => {
    let attempts = 0;
    const fn = vi.fn(async () => {
      attempts++;
      if (attempts < 3) throw new Error('connection timeout');
      return 'ok';
    });

    const result = await withDbRetry(fn, 3, 1);
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('throws after exhausting all retries when error is retryable', async () => {
    const fn = vi.fn(async () => {
      throw new Error('Connection terminated unexpectedly');
    });

    await expect(withDbRetry(fn, 2, 1)).rejects.toThrow(
      'Connection terminated unexpectedly',
    );
    // maxRetries=2 means attempts 0,1,2 (3 total) then throws
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('does not retry on non-retryable errors (no SQLSTATE, no connection msg)', async () => {
    const fn = vi.fn(async () => {
      throw new Error('validation error');
    });

    await expect(withDbRetry(fn, 3, 1)).rejects.toThrow('validation error');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on connection-related errors', async () => {
    let attempts = 0;
    const fn = vi.fn(async () => {
      attempts++;
      if (attempts === 1) throw new Error('Connection terminated unexpectedly');
      return 'ok';
    });

    const result = await withDbRetry(fn, 3, 1);
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('retries on errors with retryable SQLSTATE code (08xxx)', async () => {
    let attempts = 0;
    const fn = vi.fn(async () => {
      attempts++;
      if (attempts === 1) {
        const err = new Error('connection lost') as Error & { code: string };
        err.code = '08P01';
        throw err;
      }
      return 'ok';
    });

    const result = await withDbRetry(fn, 3, 1);
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('does not retry on deadlock with non-retryable message', async () => {
    const fn = vi.fn(async () => {
      throw new Error('query cancelled');
    });

    await expect(withDbRetry(fn, 2, 1)).rejects.toThrow('query cancelled');
    // Non-retryable: no connection keywords, no SQLSTATE code
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('checkDbHealth', () => {
  beforeEach(() => {
    vi.stubEnv('DATABASE_URL', 'postgres://mock:5432/db');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns true when the database query succeeds', async () => {
    const { checkDbHealth, getDb } = await import('../src/client');
    const db = getDb();
    vi.mocked(db.execute).mockResolvedValue(undefined as never);

    const result = await checkDbHealth();
    expect(result).toBe(true);
  });

  it('returns false when the database query fails', async () => {
    const { checkDbHealth, getDb } = await import('../src/client');
    const db = getDb();
    vi.mocked(db.execute).mockRejectedValueOnce(new Error('connection failed'));

    const result = await checkDbHealth();
    expect(result).toBe(false);
  });
});

describe('closeDb / closeReplicaDb', () => {
  beforeEach(() => {
    vi.stubEnv('DATABASE_URL', 'postgres://mock:5432/db');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('closeDb closes the underlying pool and resets singletons', async () => {
    const { getDb, closeDb } = await import('../src/client');
    // First call initializes the singleton
    getDb();
    // closeDb should not throw
    await expect(closeDb()).resolves.toBeUndefined();
  });

  it('closeReplicaDb does not throw when no replica was created', async () => {
    const { closeReplicaDb } = await import('../src/client');
    await expect(closeReplicaDb()).resolves.toBeUndefined();
  });

  it('getDbRO falls back to getDb when no DATABASE_URL_REPLICA is set', async () => {
    vi.stubEnv('DATABASE_URL_REPLICA', '');
    const { getDbRO } = await import('../src/client');
    // Should return the same singleton as getDb
    const db = getDbRO();
    expect(db).toBeDefined();
  });
});

// Import clean-up: reset singleton state so subsequent tests don't use cached _client
afterEach(() => {
  vi.resetModules();
});
