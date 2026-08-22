// SPDX-License-Identifier: Apache-2.0

import { afterEach, describe, expect, it, vi } from 'vitest';

// Mock getDb so we can control the advisory lock SQL calls.
const mockExecute = vi.fn();
vi.mock('@kestrel/db', () => ({
  getDb: () => ({ execute: mockExecute }),
}));

// Import after mock is set up.
const { tryWorkflowClaimLock } = await import('../src/mastra-v2/advisory-lock');

/** Extract the raw SQL string from a drizzle SQL object (works across drizzle versions). */
function sqlStringFromArg(arg: unknown): string {
  if (arg && typeof arg === 'object' && 'queryChunks' in arg) {
    const chunks = (arg as { queryChunks?: Array<{ value?: string[] }> }).queryChunks;
    if (Array.isArray(chunks) && chunks[0]?.value) return chunks[0].value.join('');
  }
  if (typeof arg === 'string') return arg;
  return String(arg);
}

describe('tryWorkflowClaimLock', () => {
  afterEach(() => {
    mockExecute.mockReset();
  });

  it('acquires the lock and returns a release function when pg_try_advisory_lock returns true', async () => {
    mockExecute.mockResolvedValue([{ acquired: true }]);
    const release = await tryWorkflowClaimLock('full-analysis');
    expect(typeof release).toBe('function');
    expect(mockExecute).toHaveBeenCalledTimes(1);
    const sqlStr = sqlStringFromArg(mockExecute.mock.calls[0]![0]);
    expect(sqlStr).toContain('pg_try_advisory_lock');
  });

  it('calls pg_advisory_unlock on release', async () => {
    mockExecute.mockResolvedValue([{ acquired: true }]);
    const release = await tryWorkflowClaimLock('full-analysis');
    release();
    // Fire-and-forget — allow microtask to settle.
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(mockExecute).toHaveBeenCalledTimes(2);
    const unlockSql = sqlStringFromArg(mockExecute.mock.calls[1]![0]);
    expect(unlockSql).toContain('pg_advisory_unlock');
  });

  it('returns a no-op release when the lock is not acquired', async () => {
    mockExecute.mockResolvedValue([{ acquired: false }]);
    const release = await tryWorkflowClaimLock('full-analysis');
    release();
    expect(mockExecute).toHaveBeenCalledTimes(1);
  });

  it('returns a no-op release when the DB call throws (e.g. PGlite)', async () => {
    mockExecute.mockRejectedValue(new Error('function pg_try_advisory_lock does not exist'));
    const release = await tryWorkflowClaimLock('full-analysis');
    expect(typeof release).toBe('function');
    release();
    expect(mockExecute).toHaveBeenCalledTimes(1);
  });

  it('uses a deterministic key for the same workflow name', async () => {
    mockExecute.mockResolvedValue([{ acquired: true }]);
    await tryWorkflowClaimLock('full-analysis');
    await tryWorkflowClaimLock('full-analysis');
    const firstSql = sqlStringFromArg(mockExecute.mock.calls[0]![0]);
    const secondSql = sqlStringFromArg(mockExecute.mock.calls[1]![0]);
    expect(firstSql).toBe(secondSql);
  });

  it('uses different keys for different workflow names', async () => {
    mockExecute.mockResolvedValue([{ acquired: true }]);
    await tryWorkflowClaimLock('full-analysis');
    await tryWorkflowClaimLock('symbol-research');
    const firstSql = sqlStringFromArg(mockExecute.mock.calls[0]![0]);
    const secondSql = sqlStringFromArg(mockExecute.mock.calls[1]![0]);
    expect(firstSql).not.toBe(secondSql);
  });
});
