import { describe, expect, it } from 'vitest';

import { estimateCostUsd } from '../src/cost';

describe('estimateCostUsd', () => {
  it('returns 0 for zero tokens', () => {
    expect(estimateCostUsd('openai/gpt-4.1', 0, 0)).toBe(0);
  });

  it('uses the listed gpt-4.1 rates', () => {
    // 1M input + 1M output → 5 + 15 = 20 USD per the table in cost.ts
    expect(estimateCostUsd('openai/gpt-4.1', 1_000_000, 1_000_000)).toBeCloseTo(20, 6);
  });

  it('falls back to the safety rate for unknown models', () => {
    // Same as gpt-4.1 baseline — conservative.
    expect(estimateCostUsd('does-not-exist/x', 1_000_000, 1_000_000)).toBeCloseTo(20, 6);
  });

  it('mini model is much cheaper', () => {
    const main = estimateCostUsd('openai/gpt-4.1', 100_000, 50_000);
    const mini = estimateCostUsd('openai/gpt-4.1-mini', 100_000, 50_000);
    expect(mini).toBeLessThan(main / 5);
  });
});
