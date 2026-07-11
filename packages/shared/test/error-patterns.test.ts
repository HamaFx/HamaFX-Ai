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

import { findErrorPattern, ERROR_PATTERNS } from '../src';
import { AppError } from '../src';

describe('ERROR_PATTERNS', () => {
  it('contains patterns for common operational errors', () => {
    const codes = ERROR_PATTERNS.map((p) => p.code).filter(Boolean);
    expect(codes).toContain('BUDGET_EXCEEDED');
    expect(codes).toContain('UNAUTHORIZED');
    expect(codes).toContain('FORBIDDEN');
    expect(codes).toContain('PROVIDER_UNAVAILABLE');
  });

  it('every pattern has a description and suggested fix', () => {
    for (const pattern of ERROR_PATTERNS) {
      expect(pattern.description).toBeTruthy();
      expect(pattern.suggestedFix).toBeTruthy();
      expect(pattern.relatedFiles).toBeInstanceOf(Array);
      expect(typeof pattern.retryable).toBe('boolean');
    }
  });
});

describe('findErrorPattern', () => {
  it('returns null for unknown errors', () => {
    expect(findErrorPattern(new Error('Some random error'))).toBeNull();
    expect(findErrorPattern('unknown failure')).toBeNull();
  });

  it('matches by error code', () => {
    const err = new AppError('BUDGET_EXCEEDED', 'Daily AI budget exceeded', 503);
    const pattern = findErrorPattern(err);
    expect(pattern).not.toBeNull();
    expect(pattern?.code).toBe('BUDGET_EXCEEDED');
    expect(pattern?.retryable).toBe(false);
  });

  it('matches by message substring', () => {
    const err = new Error('User settings not found during onboarding');
    const pattern = findErrorPattern(err);
    expect(pattern).not.toBeNull();
    expect(pattern?.description).toBe('User has not completed onboarding');
  });

  it('matches regex patterns', () => {
    const err = new Error('CSRF token missing or invalid');
    const pattern = findErrorPattern(err);
    expect(pattern).not.toBeNull();
    expect(pattern?.code).toBeUndefined();
    expect(pattern?.description).toBe('CSRF token validation failed');
  });

  it('matches provider unavailable errors', () => {
    const err = new Error('provider unavailable: BiQuote returned 500');
    const pattern = findErrorPattern(err);
    expect(pattern).not.toBeNull();
    expect(pattern?.code).toBe('PROVIDER_UNAVAILABLE');
    expect(pattern?.retryable).toBe(true);
  });

  it('matches unauthorized errors', () => {
    const err = new Error('UNAUTHORIZED: session expired');
    const pattern = findErrorPattern(err);
    expect(pattern).not.toBeNull();
    expect(pattern?.code).toBe('UNAUTHORIZED');
  });

  it('matches forbidden errors', () => {
    const err = new Error('Forbidden: admin access required');
    const pattern = findErrorPattern(err);
    expect(pattern).not.toBeNull();
    expect(pattern?.code).toBe('FORBIDDEN');
  });

  it('matches rate limited errors', () => {
    const err = new AppError('RATE_LIMITED', 'Too Many Requests', 429);
    const pattern = findErrorPattern(err);
    expect(pattern).not.toBeNull();
    expect(pattern?.code).toBe('RATE_LIMITED');
    expect(pattern?.retryable).toBe(true);
  });

  it('matches validation errors', () => {
    const err = new AppError('VALIDATION', 'Invalid input', 400);
    const pattern = findErrorPattern(err);
    expect(pattern).not.toBeNull();
    expect(pattern?.code).toBe('VALIDATION');
  });

  it('matches internal errors', () => {
    const err = new AppError('INTERNAL', 'Unexpected failure', 500);
    const pattern = findErrorPattern(err);
    expect(pattern).not.toBeNull();
    expect(pattern?.code).toBe('INTERNAL');
  });
});
