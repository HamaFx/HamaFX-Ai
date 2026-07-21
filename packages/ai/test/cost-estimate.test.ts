import { describe, expect, it } from 'vitest';
import { estimateCostUsd, DEFAULT_TURN_ESTIMATE_USD, DEFAULT_MAX_DAILY_USD } from '../src/cost';

describe('estimateCostUsd', () => {
  it('calculates cost for known model', () => {
    // gemini-2.5-flash: input $0.30/M, output $2.50/M
    // 1000 input + 200 output tokens
    const cost = estimateCostUsd('google/gemini-2.5-flash', 1_000, 200);
    expect(cost).toBeCloseTo(0.0008, 6);
  });

  it('uses fallback rate for unknown model', () => {
    const cost = estimateCostUsd('unknown/model', 1_000_000, 500_000);
    // Fallback: $5/M input, $15/M output
    expect(cost).toBeCloseTo(5 + 7.5, 4);
  });

  it('handles zero tokens', () => {
    const cost = estimateCostUsd('openai/gpt-4o', 0, 0);
    expect(cost).toBe(0);
  });

  it('handles google-vertex prefixed model IDs', () => {
    // Should map to google/ prefix
    const vertexCost = estimateCostUsd('google-vertex/gemini-2.5-flash', 1_000, 100);
    const googleCost = estimateCostUsd('google/gemini-2.5-flash', 1_000, 100);
    expect(vertexCost).toBe(googleCost);
  });

  it('handles bare gemini model ID (BYOK path)', () => {
    const bareCost = estimateCostUsd('gemini-2.5-flash', 1_000, 100);
    const qualifiedCost = estimateCostUsd('google/gemini-2.5-flash', 1_000, 100);
    expect(bareCost).toBe(qualifiedCost);
  });

  it('handles deepseek model IDs', () => {
    // deepseek-v4-flash: $0.14/M input, $0.28/M output
    const cost = estimateCostUsd('deepseek/deepseek-v4-flash', 1_000_000, 500_000);
    expect(cost).toBeCloseTo(0.14 + 0.14, 4);
  });

  it('returns negative cost for negative tokens (caller must validate)', () => {
    // estimateCostUsd is a pure calculation; negative tokens produce
    // negative costs. Callers are responsible for clamping inputs.
    const cost = estimateCostUsd('any/model', -100, -50);
    expect(cost).toBeLessThan(0);
  });
});

describe('constants', () => {
  it('DEFAULT_TURN_ESTIMATE_USD is positive', () => {
    expect(DEFAULT_TURN_ESTIMATE_USD).toBeGreaterThan(0);
  });

  it('DEFAULT_MAX_DAILY_USD is positive', () => {
    expect(DEFAULT_MAX_DAILY_USD).toBeGreaterThan(0);
  });
});
