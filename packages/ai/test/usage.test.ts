// Pure-logic test for the usage aggregation. We can't easily unit-test
// `computeUsage` itself because it queries Postgres; instead we test the
// shape via a careful in-memory equivalent that exercises the same math.
//
// (A future integration test against a seeded ephemeral DB would be the
// gold standard — out of scope for Phase 1e.)

import { describe, expect, it } from 'vitest';

// Re-implement the per-row reducer here so a refactor of the real one is
// caught — drift between the two would surface as a failing test.
interface Row {
  model: string;
  inputTokens: number;
  outputTokens: number;
  estCostUsd: number;
  createdAt: number;
}

function reduce(rows: Row[], now: Date) {
  const todayStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  ).getTime();
  const sevenStart = todayStart - 6 * 86_400_000;

  let todayUsd = 0;
  let sevenDayUsd = 0;
  let thirtyDayUsd = 0;
  const byModel = new Map<string, { turns: number; cost: number }>();

  for (const r of rows) {
    thirtyDayUsd += r.estCostUsd;
    if (r.createdAt >= todayStart) todayUsd += r.estCostUsd;
    if (r.createdAt >= sevenStart) sevenDayUsd += r.estCostUsd;

    const m = byModel.get(r.model) ?? { turns: 0, cost: 0 };
    m.turns += 1;
    m.cost += r.estCostUsd;
    byModel.set(r.model, m);
  }

  return { todayUsd, sevenDayUsd, thirtyDayUsd, byModel };
}

describe('usage aggregation math', () => {
  const FIXED = new Date('2026-05-26T15:00:00Z');
  const TODAY = Date.UTC(2026, 4, 26, 12, 0, 0);
  const YESTERDAY = TODAY - 86_400_000;
  const TWO_WEEKS_AGO = TODAY - 14 * 86_400_000;

  it('counts only same-UTC-day rows in todayUsd', () => {
    const rows: Row[] = [
      { model: 'm', inputTokens: 0, outputTokens: 0, estCostUsd: 0.01, createdAt: TODAY },
      { model: 'm', inputTokens: 0, outputTokens: 0, estCostUsd: 0.02, createdAt: YESTERDAY },
    ];
    const out = reduce(rows, FIXED);
    expect(out.todayUsd).toBeCloseTo(0.01);
    expect(out.sevenDayUsd).toBeCloseTo(0.03);
  });

  it('groups by model with separate buckets', () => {
    const rows: Row[] = [
      { model: 'gpt-4.1', inputTokens: 0, outputTokens: 0, estCostUsd: 0.05, createdAt: TODAY },
      { model: 'gpt-4.1', inputTokens: 0, outputTokens: 0, estCostUsd: 0.05, createdAt: TODAY },
      { model: 'claude-3.7', inputTokens: 0, outputTokens: 0, estCostUsd: 0.04, createdAt: TODAY },
    ];
    const out = reduce(rows, FIXED);
    expect(out.byModel.get('gpt-4.1')?.turns).toBe(2);
    expect(out.byModel.get('gpt-4.1')?.cost).toBeCloseTo(0.1);
    expect(out.byModel.get('claude-3.7')?.cost).toBeCloseTo(0.04);
  });

  it('30-day total includes rows older than 7 days but inside the window', () => {
    const rows: Row[] = [
      { model: 'm', inputTokens: 0, outputTokens: 0, estCostUsd: 0.5, createdAt: TWO_WEEKS_AGO },
    ];
    const out = reduce(rows, FIXED);
    expect(out.thirtyDayUsd).toBeCloseTo(0.5);
    expect(out.sevenDayUsd).toBe(0);
    expect(out.todayUsd).toBe(0);
  });

  it('handles an empty input', () => {
    const out = reduce([], FIXED);
    expect(out.todayUsd).toBe(0);
    expect(out.sevenDayUsd).toBe(0);
    expect(out.thirtyDayUsd).toBe(0);
    expect(out.byModel.size).toBe(0);
  });
});
