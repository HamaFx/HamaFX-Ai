import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

let mockSelectResult: unknown = [];
let mockExecuteResult: unknown = { rows: [] };

function thenableResolver(v: unknown) {
  return Object.assign(Promise.resolve(v), {
    orderBy: () => thenableResolver(v),
    limit: () => thenableResolver(v),
    innerJoin: () => ({ where: () => thenableResolver(v) }),
  });
}

vi.mock('@hamafx/db', () => ({
  getDb: () => ({
    select: () => ({
      from: () => ({
        where: () => thenableResolver(mockSelectResult),
      }),
    }),
    execute: () => Promise.resolve(mockExecuteResult),
  }),
  schema: {
    chatTelemetry: {},
    dailyAiSpend: {},
    users: {},
    userSettings: {},
  },
}));

vi.mock('../src/alerts/delivery', () => ({
  sendDirectNotification: vi.fn(() => Promise.resolve()),
}));

import {
  BudgetExceededError,
  DEFAULT_TURN_ESTIMATE_USD,
  dailySpendUsd,
  enforceDailyBudget,
  estimateCostUsd,
  getMonthlySpend,
  getProviderMonthlySpend,
  reservedSpendUsd,
  tryReserveBudget,
} from '../src/cost';

describe('estimateCostUsd', () => {
  it('returns 0 for zero tokens', () => {
    expect(estimateCostUsd('openai/gpt-4.1', 0, 0)).toBe(0);
  });

  it('uses the listed gpt-4.1 rates', () => {
    expect(estimateCostUsd('openai/gpt-4.1', 1_000_000, 1_000_000)).toBeCloseTo(20, 6);
  });

  it('falls back to the safety rate for unknown models', () => {
    expect(estimateCostUsd('does-not-exist/x', 1_000_000, 1_000_000)).toBeCloseTo(20, 6);
  });

  it('mini model is much cheaper', () => {
    const main = estimateCostUsd('openai/gpt-4.1', 100_000, 50_000);
    const mini = estimateCostUsd('openai/gpt-4.1-mini', 100_000, 50_000);
    expect(mini).toBeLessThan(main / 5);
  });

  it('prices Vertex-prefixed Gemini at the same rate as the gateway id', () => {
    const vertex = estimateCostUsd('google-vertex/gemini-2.5-flash', 1_000_000, 1_000_000);
    const gateway = estimateCostUsd('google/gemini-2.5-flash', 1_000_000, 1_000_000);
    expect(vertex).toBeCloseTo(gateway, 6);
    expect(vertex).toBeLessThan(5);
  });

  it('prices bare BYOK Gemini id like the gateway id', () => {
    const bare = estimateCostUsd('gemini-2.5-pro', 1_000_000, 0);
    const gateway = estimateCostUsd('google/gemini-2.5-pro', 1_000_000, 0);
    expect(bare).toBeCloseTo(gateway, 6);
  });

  it('still falls back for genuinely unknown providers', () => {
    expect(estimateCostUsd('does-not-exist/x', 1_000_000, 1_000_000)).toBeCloseTo(20, 6);
  });

  it('calculates fractional tokens correctly', () => {
    const cost = estimateCostUsd('openai/gpt-4.1', 500_000, 250_000);
    expect(cost).toBeCloseTo(5 * 0.5 + 15 * 0.25, 6);
  });

  it('prices google/gemini-2.5-flash-lite at its listed rate', () => {
    const cost = estimateCostUsd('google/gemini-2.5-flash-lite', 1_000_000, 1_000_000);
    expect(cost).toBeCloseTo(0.1 + 0.4, 6);
  });

  it('prices anthropic/claude-3.7-sonnet correctly', () => {
    const cost = estimateCostUsd('anthropic/claude-3.7-sonnet', 1_000_000, 1_000_000);
    expect(cost).toBeCloseTo(3 + 15, 6);
  });

  it('prices anthropic/claude-sonnet-4 correctly', () => {
    const cost = estimateCostUsd('anthropic/claude-sonnet-4', 1_000_000, 1_000_000);
    expect(cost).toBeCloseTo(3 + 15, 6);
  });
});

describe('DEFAULT_TURN_ESTIMATE_USD', () => {
  it('is 0.01 USD', () => {
    expect(DEFAULT_TURN_ESTIMATE_USD).toBe(0.01);
  });
});

describe('BudgetExceededError', () => {
  it('stores spent and max values', () => {
    const err = new BudgetExceededError(0.05, 1.0);
    expect(err.spent).toBe(0.05);
    expect(err.max).toBe(1.0);
    expect(err.code).toBe('BUDGET_EXCEEDED');
    expect(err.name).toBe('BudgetExceededError');
  });

  it('formats a useful error message', () => {
    const err = new BudgetExceededError(1.2345, 2.0);
    expect(err.message).toContain('$1.2345');
    expect(err.message).toContain('$2.00');
  });

  it('handles zero spent', () => {
    const err = new BudgetExceededError(0, 10);
    expect(err.spent).toBe(0);
    expect(err.max).toBe(10);
  });
});

describe('tryReserveBudget', () => {
  beforeEach(() => {
    mockExecuteResult = { rows: [] };
  });

  it('reserves budget when under cap', async () => {
    mockExecuteResult = {
      rows: [{ total_usd_cents: 5 }],
    };
    const result = await tryReserveBudget('user-1', 0.05, 1.0);
    expect(result.ok).toBe(true);
    expect(result.spent).toBe(0.05);
    expect(result.max).toBe(1.0);
  });

  it('rejects when reservation exceeds cap', async () => {
    const result = await tryReserveBudget('user-1', 2.0, 1.0);
    expect(result.ok).toBe(false);
    expect(result.max).toBe(1.0);
  });

  it('rejects when reserved rows come back empty (over cap)', async () => {
    mockExecuteResult = { rows: [] };
    const result = await tryReserveBudget('user-1', 0.01, 0.02);
    expect(result.ok).toBe(false);
  });

  it('returns ok=false without crashing when capUsd is NaN', async () => {
    // Simulate a misconfigured env where MAX_DAILY_USD is not parsed.
    // The NaN guard must return { ok: false } instead of hitting the DB
    // with an invalid bigint parameter.
    const result = await tryReserveBudget('user-1', 0.01, NaN);
    expect(result.ok).toBe(false);
    // Falls back to the DEFAULT_MAX_DAILY_USD constant (5).
    expect(result.max).toBe(5);
  });

  it('returns ok=false when capUsd is undefined (missing env)', async () => {
    const result = await tryReserveBudget('user-1', 0.01, undefined as unknown as number);
    expect(result.ok).toBe(false);
    expect(result.max).toBe(5);
  });

  it('returns ok=false when estimatedUsd is NaN', async () => {
    // Belt-and-suspenders: estCents is derived from a constant today,
    // but the guard covers future dynamic callers.
    const result = await tryReserveBudget('user-1', NaN, 5.0);
    expect(result.ok).toBe(false);
    expect(result.max).toBe(5);
  });
});

describe('enforceDailyBudget', () => {
  beforeEach(() => {
    mockSelectResult = [];
  });

  it('returns spent and max when under budget', async () => {
    mockSelectResult = [{ cents: 10 }];
    const result = await enforceDailyBudget('user-1', 5.0);
    expect(result.spent).toBe(0.1);
    expect(result.max).toBe(5.0);
  });

  it('throws BudgetExceededError when over budget', async () => {
    mockSelectResult = [{ cents: 600 }];
    await expect(enforceDailyBudget('user-1', 5.0)).rejects.toThrow(
      BudgetExceededError,
    );
  });
});

describe('dailySpendUsd', () => {
  beforeEach(() => {
    mockSelectResult = [];
  });

  it('returns 0 when no rows exist', async () => {
    mockSelectResult = [{ total: 0 }];
    const result = await dailySpendUsd('user-1');
    expect(result).toBe(0);
  });
});

describe('reservedSpendUsd', () => {
  beforeEach(() => {
    mockSelectResult = [];
  });

  it('returns 0 when no reservation exists', async () => {
    mockSelectResult = [];
    const result = await reservedSpendUsd('user-1');
    expect(result).toBe(0);
  });

  it('returns cents converted to dollars', async () => {
    mockSelectResult = [{ cents: 150 }];
    const result = await reservedSpendUsd('user-1');
    expect(result).toBe(1.5);
  });
});

describe('getMonthlySpend', () => {
  beforeEach(() => {
    mockSelectResult = [];
  });

  it('returns 0 when no rows', async () => {
    mockSelectResult = [{ totalCents: 0 }];
    const result = await getMonthlySpend('user-1');
    expect(result).toBe(0);
  });

  it('returns cents converted to dollars', async () => {
    mockSelectResult = [{ totalCents: 500 }];
    const result = await getMonthlySpend('user-1');
    expect(result).toBe(5.0);
  });
});

describe('getProviderMonthlySpend', () => {
  beforeEach(() => {
    mockSelectResult = [];
  });

  it('returns 0 when no telemetry rows', async () => {
    mockSelectResult = [];
    const result = await getProviderMonthlySpend('user-1', 'google');
    expect(result).toBe(0);
  });
});
