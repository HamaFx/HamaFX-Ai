import { describe, expect, it } from 'vitest';
import { estimateContextUsage, estimateTokens } from '../src/token-estimate';

describe('estimateContextUsage', () => {
  it('returns safe defaults for an unknown model', () => {
    const result = estimateContextUsage('unknown-model', 100, 5, 500);
    expect(result.estimatedTokens).toBeGreaterThan(0);
    expect(result.contextLimit).toBeNull();
    expect(result.shouldWarn).toBe(false);
    expect(result.shouldTruncate).toBe(false);
    expect(result.warningNote).toBeNull();
    expect(result.suggestedKeepCount).toBeNull();
  });

  it('warns for very large conversations on unknown model (>100K tokens)', () => {
    // 100_000 chars / 3.5 = ~28,571 tokens — this triggers shouldWarn for unknown models
    const result = estimateContextUsage('unknown-model', 50, 200, 400_000);
    expect(result.shouldWarn).toBe(true);
    expect(result.shouldTruncate).toBe(false);
    expect(result.warningNote).toContain('large');
    expect(result.suggestedKeepCount).toBeNull();
  });

  it('truncates for enormous conversations on unknown model (>500K tokens)', () => {
    const result = estimateContextUsage('unknown-model', 50, 200, 2_000_000);
    expect(result.shouldTruncate).toBe(true);
    expect(result.warningNote).toContain('truncated');
    expect(result.suggestedKeepCount).toBeNull();
  });

  it('warns at 80% of known context window', () => {
    // gemini-2.5-flash has 1M context. 80% = 800K tokens.
    // 800K * 3.5 = 2.8M chars
    const result = estimateContextUsage(
      'google/gemini-2.5-flash',
      500,
      50,
      2_800_000,
    );
    expect(result.shouldWarn).toBe(true);
    expect(result.shouldTruncate).toBe(false);
    expect(result.contextLimit).toBe(1_000_000);
    expect(result.warningNote).toContain('approaching');
  });

  it('truncates at 95% of known context window', () => {
    // 95% of 1M = 950K tokens = 3,325,000 chars
    const result = estimateContextUsage(
      'google/gemini-2.5-flash',
      500,
      100,
      3_400_000,
    );
    expect(result.shouldWarn).toBe(true);
    expect(result.shouldTruncate).toBe(true);
    expect(result.warningNote).toContain('exceeds');
    expect(result.suggestedKeepCount).toBeGreaterThan(0);
  });

  it('returns no warning for small conversations', () => {
    const result = estimateContextUsage(
      'anthropic/claude-sonnet-4',
      200,
      10,
      5000,
    );
    expect(result.shouldWarn).toBe(false);
    expect(result.shouldTruncate).toBe(false);
    expect(result.warningNote).toBeNull();
    expect(result.suggestedKeepCount).toBeNull();
  });

  it('handles provider/qualified model ids', () => {
    const r1 = estimateContextUsage('google/gemini-2.5-flash', 100, 5, 500);
    expect(r1.contextLimit).toBe(1_000_000);

    const r2 = estimateContextUsage('google-vertex/gemini-2.5-pro', 100, 5, 500);
    expect(r2.contextLimit).toBe(2_000_000);

    const r3 = estimateContextUsage('anthropic/claude-sonnet-4', 100, 5, 500);
    expect(r3.contextLimit).toBe(200_000);

    const r4 = estimateContextUsage('openai/gpt-4o', 100, 5, 500);
    expect(r4.contextLimit).toBe(128_000);
  });

  it('returns null contextLimit for bare model not in registry', () => {
    const result = estimateContextUsage('bare-unknown-model', 100, 5, 500);
    expect(result.contextLimit).toBeNull();
  });

  it('suggestedKeepCount is at least 4 when truncating', () => {
    const result = estimateContextUsage(
      'openai/gpt-4o',
      200,
      50,
      5_000_000,
    );
    expect(result.shouldTruncate).toBe(true);
    expect(result.suggestedKeepCount).toBeGreaterThanOrEqual(4);
  });
});

describe('estimateTokens', () => {
  it('estimates tokens for a string', () => {
    // ~100 chars / 3.5 = ~28.57 → ceil = 29
    const text = 'Hello, world! This is a test of the token estimation function.';
    const tokens = estimateTokens(text);
    expect(tokens).toBeGreaterThan(0);
    expect(tokens).toBeLessThan(text.length);
  });

  it('returns 0 for empty string', () => {
    expect(estimateTokens('')).toBe(0);
  });

  it('returns 1 for a single character', () => {
    expect(estimateTokens('a')).toBe(1);
  });
});
