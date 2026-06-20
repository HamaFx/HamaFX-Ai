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

import { describe, expect, it } from 'vitest';

import {
  classifyStreamError,
  makeFallbackPart,
  shouldFallback,
} from '../src/fallback';

describe('classifyStreamError — recoverable errors (fallback = true)', () => {
  it('falls back on a plain HTTP 401 object', () => {
    const decision = classifyStreamError({ statusCode: 401 });
    expect(decision.fallback).toBe(true);
    expect(decision.reason).toBe('auth');
  });

  it('falls back on a 403 from the response.status path', () => {
    const decision = classifyStreamError({ response: { status: 403 } });
    expect(decision.fallback).toBe(true);
    expect(decision.reason).toBe('auth');
  });

  it('falls back on a 429 rate limit', () => {
    expect(classifyStreamError({ statusCode: 429 }).reason).toBe('rate-limit');
  });

  it('falls back on a 500-series upstream failure', () => {
    expect(classifyStreamError({ status: 502 }).reason).toBe('upstream');
    expect(classifyStreamError({ status: 503 }).reason).toBe('upstream');
    expect(classifyStreamError({ status: 504 }).reason).toBe('upstream');
  });

  it('falls back on a network timeout message', () => {
    const decision = classifyStreamError(new Error('Request timed out after 30s'));
    expect(decision.fallback).toBe(true);
    expect(decision.reason).toBe('timeout');
  });

  it('falls back on an "Invalid API key" message (no status code)', () => {
    const decision = classifyStreamError(new Error('Invalid API key provided.'));
    expect(decision.fallback).toBe(true);
    expect(decision.reason).toBe('auth');
  });

  it('falls back on a quota-exhausted message', () => {
    const decision = classifyStreamError(new Error('You have exceeded your quota'));
    expect(decision.fallback).toBe(true);
    expect(decision.reason).toBe('rate-limit');
  });
});

describe('classifyStreamError — non-recoverable errors (fallback = false)', () => {
  it('does NOT fall back on a 400 bad request', () => {
    expect(classifyStreamError({ statusCode: 400 }).fallback).toBe(false);
  });

  it('does NOT fall back on a 422 unprocessable', () => {
    expect(classifyStreamError({ statusCode: 422 }).fallback).toBe(false);
  });

  it('does NOT fall back on a generic Error with no status code', () => {
    expect(classifyStreamError(new Error('something exploded')).fallback).toBe(false);
  });

  it('does NOT fall back on a string error', () => {
    expect(classifyStreamError('boom').fallback).toBe(false);
  });

  it('does NOT fall back on null/undefined', () => {
    expect(classifyStreamError(null).fallback).toBe(false);
    expect(classifyStreamError(undefined).fallback).toBe(false);
  });
});

describe('classifyStreamError — status extraction', () => {
  it('does not treat out-of-range numeric values as status codes', () => {
    // 99 / 600 / -1 should not be classified as HTTP statuses.
    expect(classifyStreamError({ statusCode: 99 }).reason).toBe('unknown');
    expect(classifyStreamError({ statusCode: 600 }).reason).toBe('unknown');
  });

  it('prefers statusCode over status when both are present', () => {
    // 401 wins over 500 — both would be recoverable, but the more
    // specific status wins. This documents the field precedence.
    const decision = classifyStreamError({ statusCode: 401, status: 500 });
    expect(decision.reason).toBe('auth');
  });
});

describe('shouldFallback — boolean shorthand', () => {
  it('returns true when classifyStreamError.fallback is true', () => {
    expect(shouldFallback({ statusCode: 429 })).toBe(true);
  });

  it('returns false otherwise', () => {
    expect(shouldFallback({ statusCode: 400 })).toBe(false);
  });
});

describe('makeFallbackPart — payload shape', () => {
  it('produces a structured data-fallback part with all fields', () => {
    const decision = classifyStreamError({ statusCode: 401 });
    const part = makeFallbackPart('anthropic:claude-sonnet-4-20250514', decision);
    expect(part).toEqual({
      type: 'data-fallback',
      reason: 'auth',
      override: 'anthropic:claude-sonnet-4-20250514',
      message: expect.stringContaining('API key'),
    });
  });

  it('preserves a custom override string verbatim', () => {
    const decision = classifyStreamError({ statusCode: 429 });
    const part = makeFallbackPart('openai/gpt-4o-mini', decision);
    expect(part.override).toBe('openai/gpt-4o-mini');
    expect(part.reason).toBe('rate-limit');
  });
});
