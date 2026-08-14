import { describe, expect, it } from 'vitest';

import { isRetryableAnalysisError } from '../src/jobs/multi-agent-analysis';

describe('isRetryableAnalysisError', () => {
  it.each([
    'request timed out',
    'timeout while waiting for provider',
    'fetch failed: ECONNRESET',
    '429 too many requests',
    'temporary connection failure',
    'provider returned 503',
  ])('classifies transient error: %s', (message) => {
    expect(isRetryableAnalysisError(new Error(message))).toBe(true);
  });

  it.each([
    'invalid user settings',
    'thread not found',
    'malformed model configuration',
  ])('does not retry permanent error: %s', (message) => {
    expect(isRetryableAnalysisError(new Error(message))).toBe(false);
  });

  it('classifies a strict Full-mode error by its preserved underlying cause', () => {
    const error = new Error('Full mode could not complete', {
      cause: new Error('provider request timed out'),
    });

    expect(isRetryableAnalysisError(error)).toBe(true);
  });
});
