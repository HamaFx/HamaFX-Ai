import { describe, expect, it, vi, beforeEach } from 'vitest';
import { BudgetExceededError } from '../src/budget-guard';

// Mock the cost module BEFORE importing the module under test
vi.mock('../src/cost', () => ({
  DEFAULT_MAX_DAILY_USD: 5,
  DEFAULT_TURN_ESTIMATE_USD: 0.05,
  tryReserveBudget: vi.fn(),
  applyBudgetDelta: vi.fn(),
  BudgetExceededError: class extends Error {
    spent: number;
    max: number;
    constructor(spent: number, max: number) {
      super(`Budget exceeded: ${spent}/${max}`);
      this.name = 'BudgetExceededError';
      this.spent = spent;
      this.max = max;
    }
  },
}));

import { reserveBudget, reconcileBudget, releaseBudget } from '../src/budget-guard';
import { tryReserveBudget, applyBudgetDelta } from '../src/cost';

const mockTryReserve = vi.mocked(tryReserveBudget);
const mockApplyDelta = vi.mocked(applyBudgetDelta);

describe('reserveBudget', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApplyDelta.mockResolvedValue(undefined);
  });

  it('returns a reservation when under budget cap', async () => {
    mockTryReserve.mockResolvedValueOnce({
      ok: true,
      spent: 1.5,
      max: 5,
    });

    const reservation = await reserveBudget('user-1', 5);

    expect(reservation.ok).toBe(true);
    expect(reservation.spent).toBe(1.5);
    expect(reservation.max).toBe(5);
    expect(reservation.reservedUsd).toBe(0.05); // DEFAULT_TURN_ESTIMATE_USD
    expect(reservation.released).toBe(false);
  });

  it('throws BudgetExceededError when over cap', async () => {
    mockTryReserve.mockResolvedValueOnce({
      ok: false,
      spent: 5,
      max: 5,
    });

    await expect(reserveBudget('user-1', 5)).rejects.toThrow(BudgetExceededError);
  });

  it('falls back to DEFAULT_MAX_DAILY_USD when maxDailyUsd is null/undefined', async () => {
    mockTryReserve.mockResolvedValueOnce({
      ok: true,
      spent: 0,
      max: 5,
    });

    // Pass undefined — should fall back to DEFAULT_MAX_DAILY_USD (5)
    await reserveBudget('user-1', undefined as unknown as number);

    expect(mockTryReserve).toHaveBeenCalledWith('user-1', 0.05, 5);
  });
});

describe('reconcileBudget', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('applies positive delta when actual cost exceeds reserved', async () => {
    await reconcileBudget('user-1', 0.10, 0.05);

    expect(mockApplyDelta).toHaveBeenCalledWith('user-1', 0.05);
  });

  it('applies negative delta when actual cost is less than reserved', async () => {
    await reconcileBudget('user-1', 0.01, 0.05);

    expect(mockApplyDelta).toHaveBeenCalledWith('user-1', -0.04);
  });

  it('does nothing when delta is negligible (< 0.0001)', async () => {
    await reconcileBudget('user-1', 0.05000001, 0.05);

    expect(mockApplyDelta).not.toHaveBeenCalled();
  });

  it('handles exact match (delta = 0)', async () => {
    await reconcileBudget('user-1', 0.05, 0.05);

    expect(mockApplyDelta).not.toHaveBeenCalled();
  });

  it('swallows errors from applyBudgetDelta', async () => {
    mockApplyDelta.mockRejectedValueOnce(new Error('DB down'));

    // Should not throw
    await expect(reconcileBudget('user-1', 0.10, 0.05)).resolves.toBeUndefined();
  });
});

describe('releaseBudget', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('releases the budget reservation and marks as released', async () => {
    const reservation = {
      ok: true,
      spent: 1,
      max: 5,
      reservedUsd: 0.05,
      released: false,
    };

    await releaseBudget(reservation, 'user-1');

    expect(mockApplyDelta).toHaveBeenCalledWith('user-1', -0.05);
    expect(reservation.released).toBe(true);
  });

  it('is idempotent — does nothing if already released', async () => {
    const reservation = {
      ok: true,
      spent: 1,
      max: 5,
      reservedUsd: 0.05,
      released: true,
    };

    await releaseBudget(reservation, 'user-1');

    expect(mockApplyDelta).not.toHaveBeenCalled();
  });

  it('swallows errors from applyBudgetDelta', async () => {
    mockApplyDelta.mockRejectedValueOnce(new Error('DB down'));

    const reservation = {
      ok: true,
      spent: 1,
      max: 5,
      reservedUsd: 0.05,
      released: false,
    };

    await expect(releaseBudget(reservation, 'user-1')).resolves.toBeUndefined();
    // released should still be set despite the error
    expect(reservation.released).toBe(true);
  });
});
