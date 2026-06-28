import { describe, expect, it } from 'vitest';

import { extractRateLimits } from '../src/rate-limits';

describe('extractRateLimits', () => {
  it('parses OpenAI-style rate limit headers', () => {
    const result = extractRateLimits({
      'x-ratelimit-remaining-requests': '49',
      'x-ratelimit-remaining-tokens': '50000',
      'x-ratelimit-reset-requests': '1s',
      'x-ratelimit-reset-tokens': '10s',
    });
    expect(result).toBeDefined();
    expect(result!.remainingRequests).toBe(49);
    expect(result!.remainingTokens).toBe(50000);
    expect(result!.resetRequests).toBe('1s');
    expect(result!.resetTokens).toBe('10s');
  });

  it('parses Anthropic-style rate limit headers', () => {
    const result = extractRateLimits({
      'anthropic-ratelimit-requests-remaining': '10',
      'anthropic-ratelimit-tokens-remaining': '8000',
      'anthropic-ratelimit-requests-reset': '2026-06-28T12:00:00Z',
      'anthropic-ratelimit-tokens-reset': '2026-06-28T12:00:00Z',
    });
    expect(result).toBeDefined();
    expect(result!.remainingRequests).toBe(10);
    expect(result!.remainingTokens).toBe(8000);
    expect(result!.resetRequests).toBe('2026-06-28T12:00:00Z');
    expect(result!.resetTokens).toBe('2026-06-28T12:00:00Z');
  });

  it('returns undefined when headers are null', () => {
    expect(extractRateLimits(null as unknown as Record<string, string>)).toBeUndefined();
  });

  it('returns undefined when headers are undefined', () => {
    expect(extractRateLimits(undefined)).toBeUndefined();
  });

  it('returns undefined when no rate limit headers are present', () => {
    const result = extractRateLimits({ 'content-type': 'application/json' });
    expect(result).toBeUndefined();
  });

  it('handles mixed case header names (case-insensitive)', () => {
    const result = extractRateLimits({
      'X-RateLimit-Remaining-Requests': '99',
      'Anthropic-RateLimit-Requests-Remaining': '5',
    });
    expect(result).toBeDefined();
    expect(result!.remainingRequests).toBe(5);
  });

  it('returns undefined for NaN values in numeric fields', () => {
    const result = extractRateLimits({
      'x-ratelimit-remaining-requests': 'not-a-number',
    });
    expect(result!.remainingRequests).toBeUndefined();
  });

  it('returns undefined for empty headers object', () => {
    expect(extractRateLimits({})).toBeUndefined();
  });

  it('parses Groq-style headers (same format as OpenAI)', () => {
    const result = extractRateLimits({
      'x-ratelimit-remaining-requests': '100',
      'x-ratelimit-remaining-tokens': '6000',
    });
    expect(result).toBeDefined();
    expect(result!.remainingRequests).toBe(100);
    expect(result!.remainingTokens).toBe(6000);
  });

  it('Anthropic headers override OpenAI headers when both present', () => {
    const result = extractRateLimits({
      'x-ratelimit-remaining-requests': '50',
      'anthropic-ratelimit-requests-remaining': '10',
    });
    expect(result!.remainingRequests).toBe(10);
  });
});
