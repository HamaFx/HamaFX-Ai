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

// Phase 6 — Task 29: withIsolatedDb rollback verification test

import { vi, describe, expect, it } from 'vitest';

vi.mock('server-only', () => ({}));

const mockTransaction = vi.fn();

vi.mock('../src/client', () => ({
  getDb: vi.fn(() => ({
    transaction: mockTransaction,
    execute: vi.fn(),
  })),
}));

import { withIsolatedDb } from '../src/test-utils';

describe('Phase 6 — Task 29: withIsolatedDb rollback verification', () => {
  it('executes the test function and provides a tx client', async () => {
    let receivedTx: unknown = null;
    mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<void>) => {
      const tx = { execute: vi.fn() };
      receivedTx = tx;
      await fn(tx);
      throw new Error('ROLLBACK_FOR_TESTING');
    });

    let testRan = false;
    await withIsolatedDb(async (tx) => {
      testRan = true;
      expect(tx).toBeDefined();
      expect((tx as { execute: unknown }).execute).toBeDefined();
    });

    expect(testRan).toBe(true);
    expect(receivedTx).not.toBeNull();
  });

  it('silently catches the ROLLBACK_FOR_TESTING error', async () => {
    mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<void>) => {
      await fn({ execute: vi.fn() });
      throw new Error('ROLLBACK_FOR_TESTING');
    });

    await expect(
      withIsolatedDb(async () => {}),
    ).resolves.toBeUndefined();
  });

  it('re-throws non-rollback errors from the test function', async () => {
    mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<void>) => {
      await fn({ execute: vi.fn() });
    });

    await expect(
      withIsolatedDb(async () => { throw new Error('test failure'); }),
    ).rejects.toThrow('test failure');
  });

  it('re-throws non-rollback errors from the transaction itself', async () => {
    mockTransaction.mockImplementation(async () => {
      throw new Error('connection lost');
    });

    await expect(
      withIsolatedDb(async () => {}),
    ).rejects.toThrow('connection lost');
  });

  it('provides the same shape as getDb() return value', async () => {
    mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<void>) => {
      const tx = { execute: vi.fn(), select: vi.fn(), insert: vi.fn() };
      await fn(tx);
      throw new Error('ROLLBACK_FOR_TESTING');
    });

    await withIsolatedDb(async (tx) => {
      expect(typeof (tx as { execute: unknown }).execute).toBe('function');
    });
  });
});