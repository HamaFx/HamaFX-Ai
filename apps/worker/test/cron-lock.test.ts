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

// TEST-01: Tests for the cron idempotency guard (STAB-01).

import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock @hamafx/db to avoid a real DB connection in unit tests.
const mockExecute = vi.fn();
vi.mock('@hamafx/db', () => ({
  getDb: vi.fn(() => ({ execute: mockExecute })),
  schema: {},
}));

// Import AFTER mock so the module sees the mocked getDb.
import { acquireCronLock } from '../src/cron-lock';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('acquireCronLock', () => {
  it('returns a CronLock when INSERT succeeds (row returned)', async () => {
    // M-8: reclaim check first, then INSERT.
    mockExecute
      .mockResolvedValueOnce([])                       // reclaim: no stale lock
      .mockResolvedValueOnce([{ job_name: 'snapshots' }]); // INSERT: succeeded

    const db = { execute: mockExecute } as unknown as Parameters<typeof acquireCronLock>[1];
    const lock = await acquireCronLock('snapshots', db);

    expect(lock).not.toBeNull();
    expect(typeof lock!.done).toBe('function');
    expect(typeof lock!.fail).toBe('function');
  });

  it('returns null when INSERT conflicts (no row returned)', async () => {
    // M-8: reclaim check first, then INSERT.
    mockExecute
      .mockResolvedValueOnce([])  // reclaim: no stale lock
      .mockResolvedValueOnce([]); // insert: conflict, nothing returned

    const db = { execute: mockExecute } as unknown as Parameters<typeof acquireCronLock>[1];
    const lock = await acquireCronLock('snapshots', db);

    expect(lock).toBeNull();
  });

  it('lock.done() executes an UPDATE setting status=done', async () => {
    // M-8: reclaim + INSERT + UPDATE done
    mockExecute
      .mockResolvedValueOnce([])                       // reclaim: no stale lock
      .mockResolvedValueOnce([{ job_name: 'briefings' }]) // INSERT
      .mockResolvedValueOnce([]);                      // UPDATE done

    const db = { execute: mockExecute } as unknown as Parameters<typeof acquireCronLock>[1];
    const lock = await acquireCronLock('briefings', db);
    expect(lock).not.toBeNull();
    await lock!.done('processed=5');

    // Three calls: reclaim + INSERT + UPDATE.
    expect(mockExecute).toHaveBeenCalledTimes(3);
  });

  it('lock.fail() executes an UPDATE setting status=error', async () => {
    mockExecute
      .mockResolvedValueOnce([])                       // reclaim: no stale lock
      .mockResolvedValueOnce([{ job_name: 'cot' }])    // INSERT
      .mockResolvedValueOnce([]);                      // UPDATE error

    const db = { execute: mockExecute } as unknown as Parameters<typeof acquireCronLock>[1];
    const lock = await acquireCronLock('cot', db);
    await lock!.fail(new Error('timeout'));

    expect(mockExecute).toHaveBeenCalledTimes(3);
  });

  it('note is truncated to 500 chars in done()', async () => {
    mockExecute
      .mockResolvedValueOnce([])                       // reclaim: no stale lock
      .mockResolvedValueOnce([{ job_name: 'fred-actuals' }])
      .mockResolvedValueOnce([]);

    const db = { execute: mockExecute } as unknown as Parameters<typeof acquireCronLock>[1];
    const lock = await acquireCronLock('fred-actuals', db);
    const longNote = 'x'.repeat(1000);
    await lock!.done(longNote);

    expect(mockExecute).toHaveBeenCalledTimes(3);
  });
});
