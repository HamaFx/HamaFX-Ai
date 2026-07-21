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

// Plan 04 §5 — Characterization tests for budget-reservation.ts.
// Mock the cost module to control tryReserveBudget / applyBudgetDelta
// without touching the database.

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

let mockTryReserveBudget: ReturnType<typeof vi.fn>;
let mockApplyBudgetDelta: ReturnType<typeof vi.fn>;

vi.mock('../src/cost', () => ({
  get tryReserveBudget() {
    return mockTryReserveBudget;
  },
  get applyBudgetDelta() {
    return mockApplyBudgetDelta;
  },
  get BudgetExceededError() {
    return BudgetExceededErrorActual;
  },
  DEFAULT_TURN_ESTIMATE_USD: 0.01,
}));

// We need the real BudgetExceededError class for instanceof checks.
const BudgetExceededErrorActual = (
  await vi.importActual<typeof import('../src/cost')>('../src/cost')
).BudgetExceededError;

import { reserveTurnBudget } from '../src/budget-reservation';
import type { BudgetHandle } from '../src/budget-reservation';

describe('reserveTurnBudget', () => {
  beforeEach(() => {
    mockTryReserveBudget = vi.fn();
    mockApplyBudgetDelta = vi.fn(() => Promise.resolve());
  });

  it('returns a BudgetHandle when reservation succeeds', async () => {
    mockTryReserveBudget.mockResolvedValue({ ok: true, spent: 0.05, max: 5.0 });

    const handle = await reserveTurnBudget({ userId: 'u1', maxDailyUsd: 5.0 });

    expect(handle.reservedUsd).toBe(0.01); // DEFAULT_TURN_ESTIMATE_USD
    expect(handle.spent).toBe(0.05);
    expect(handle.max).toBe(5.0);
    expect(handle.released).toBe(false);
    expect(mockTryReserveBudget).toHaveBeenCalledWith('u1', 0.01, 5.0);
  });

  it('uses custom estimateUsd when provided', async () => {
    mockTryReserveBudget.mockResolvedValue({ ok: true, spent: 0.10, max: 5.0 });

    const handle = await reserveTurnBudget({ userId: 'u1', estimateUsd: 0.05, maxDailyUsd: 5.0 });

    expect(handle.reservedUsd).toBe(0.05);
    expect(mockTryReserveBudget).toHaveBeenCalledWith('u1', 0.05, 5.0);
  });

  it('throws BudgetExceededError when reservation fails', async () => {
    mockTryReserveBudget.mockResolvedValue({ ok: false, spent: 4.99, max: 5.0 });

    await expect(
      reserveTurnBudget({ userId: 'u1', maxDailyUsd: 5.0 }),
    ).rejects.toThrow(BudgetExceededErrorActual);
  });
});

describe('BudgetHandle.reconcile', () => {
  beforeEach(() => {
    mockTryReserveBudget = vi.fn().mockResolvedValue({ ok: true, spent: 0.00, max: 5.0 });
    mockApplyBudgetDelta = vi.fn(() => Promise.resolve());
  });

  async function makeHandle(estimateUsd?: number): Promise<BudgetHandle> {
    if (estimateUsd === undefined) {
      return reserveTurnBudget({ userId: 'u1', maxDailyUsd: 5.0 });
    }
    return reserveTurnBudget({ userId: 'u1', estimateUsd, maxDailyUsd: 5.0 });
  }

  it('calls applyBudgetDelta with the delta (observed - estimate)', async () => {
    const handle = await makeHandle(0.05);

    await handle.reconcile(0.08);

    expect(mockApplyBudgetDelta).toHaveBeenCalledWith('u1', expect.closeTo(0.03, 5));
  });

  it('calls applyBudgetDelta with negative delta when under estimate', async () => {
    const handle = await makeHandle(0.05);

    await handle.reconcile(0.02);

    expect(mockApplyBudgetDelta).toHaveBeenCalledWith('u1', expect.closeTo(-0.03, 5));
  });

  it('marks handle as released after reconcile', async () => {
    const handle = await makeHandle();

    await handle.reconcile(0.01);

    expect(handle.released).toBe(true);
  });

  it('does not throw when applyBudgetDelta fails', async () => {
    mockApplyBudgetDelta.mockRejectedValue(new Error('DB down'));
    const handle = await makeHandle();

    await expect(handle.reconcile(0.01)).resolves.toBeUndefined();
  });
});

describe('BudgetHandle.release', () => {
  beforeEach(() => {
    mockTryReserveBudget = vi.fn().mockResolvedValue({ ok: true, spent: 0.00, max: 5.0 });
    mockApplyBudgetDelta = vi.fn(() => Promise.resolve());
  });

  async function makeHandle(estimateUsd?: number): Promise<BudgetHandle> {
    if (estimateUsd === undefined) {
      return reserveTurnBudget({ userId: 'u1', maxDailyUsd: 5.0 });
    }
    return reserveTurnBudget({ userId: 'u1', estimateUsd, maxDailyUsd: 5.0 });
  }

  it('calls applyBudgetDelta with -estimateUsd', async () => {
    const handle = await makeHandle(0.05);

    await handle.release();

    expect(mockApplyBudgetDelta).toHaveBeenCalledWith('u1', expect.closeTo(-0.05, 5));
  });

  it('marks handle as released', async () => {
    const handle = await makeHandle();

    await handle.release();

    expect(handle.released).toBe(true);
  });

  it('is idempotent — second call does not re-apply delta', async () => {
    const handle = await makeHandle();

    await handle.release();
    await handle.release();

    expect(mockApplyBudgetDelta).toHaveBeenCalledTimes(1);
  });

  it('does not throw when applyBudgetDelta fails', async () => {
    mockApplyBudgetDelta.mockRejectedValue(new Error('DB down'));
    const handle = await makeHandle();

    await expect(handle.release()).resolves.toBeUndefined();
  });

  it('reconcile after release is still safe (marks released)', async () => {
    const handle = await makeHandle(0.05);

    await handle.release();
    // reconcile doesn't have its own idempotency guard currently,
    // but release already fired the delta. reconcile just marks released
    // and fires its delta. This test documents the current behavior.
    await handle.reconcile(0.08);

    // applyBudgetDelta called twice: once for release (-0.05), once for reconcile (+0.03)
    expect(mockApplyBudgetDelta).toHaveBeenCalledTimes(2);
  });
});
