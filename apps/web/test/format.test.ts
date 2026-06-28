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

import { formatRelative } from '../src/lib/format';

const NOW = 1_700_000_000_000;

describe('formatRelative — just now', () => {
  it('returns "just now" for timestamps in the future', () => {
    expect(formatRelative(NOW + 1000, NOW)).toBe('just now');
  });

  it('returns "just now" for timestamps less than 60s ago', () => {
    expect(formatRelative(NOW - 30_000, NOW)).toBe('just now');
    expect(formatRelative(NOW - 59_999, NOW)).toBe('just now');
  });

  it('returns "just now" for 0ms difference', () => {
    expect(formatRelative(NOW, NOW)).toBe('just now');
  });
});

describe('formatRelative — minutes', () => {
  it('returns "1m ago" for exactly 60s', () => {
    expect(formatRelative(NOW - 60_000, NOW)).toBe('1m ago');
  });

  it('returns "5m ago" for ~5 minutes', () => {
    expect(formatRelative(NOW - 5 * 60_000, NOW)).toBe('5m ago');
  });

  it('returns "59m ago" just under an hour', () => {
    expect(formatRelative(NOW - 59 * 60_000, NOW)).toBe('59m ago');
  });

  it('floors minutes rather than rounding', () => {
    expect(formatRelative(NOW - 90_000, NOW)).toBe('1m ago');
  });
});

describe('formatRelative — hours', () => {
  it('returns "1h ago" for exactly 1 hour', () => {
    expect(formatRelative(NOW - 3_600_000, NOW)).toBe('1h ago');
  });

  it('returns "2h ago" for ~2 hours', () => {
    expect(formatRelative(NOW - 7_200_000, NOW)).toBe('2h ago');
  });

  it('returns "23h ago" just under a day', () => {
    expect(formatRelative(NOW - 23 * 3_600_000, NOW)).toBe('23h ago');
  });
});

describe('formatRelative — days', () => {
  it('returns "1d ago" for exactly 24 hours', () => {
    expect(formatRelative(NOW - 86_400_000, NOW)).toBe('1d ago');
  });

  it('returns "6d ago" just under a week', () => {
    expect(formatRelative(NOW - 6 * 86_400_000, NOW)).toBe('6d ago');
  });

  it('floors days rather than rounding up', () => {
    expect(formatRelative(NOW - 30_000, NOW)).toBe('just now');
  });
});

describe('formatRelative — weeks', () => {
  it('returns "1w ago" for exactly 7 days', () => {
    expect(formatRelative(NOW - 7 * 86_400_000, NOW)).toBe('1w ago');
  });

  it('returns "3w ago" for ~3 weeks', () => {
    expect(formatRelative(NOW - 21 * 86_400_000, NOW)).toBe('3w ago');
  });

  it('returns "4w ago" for ~4 weeks', () => {
    expect(formatRelative(NOW - 28 * 86_400_000, NOW)).toBe('4w ago');
  });
});

describe('formatRelative — older than 4 weeks', () => {
  it('returns a locale date string for > 30 days', () => {
    const old = NOW - 31 * 86_400_000;
    const result = formatRelative(old, NOW);
    expect(result).not.toMatch(/^\d+[mhdw] ago$/);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });
});

describe('formatRelative — edge cases', () => {
  it('returns empty string for NaN timestamp', () => {
    expect(formatRelative(NaN, NOW)).toBe('');
  });

  it('returns empty string for Infinity timestamp', () => {
    expect(formatRelative(Infinity, NOW)).toBe('');
  });

  it('returns empty string for -Infinity timestamp', () => {
    expect(formatRelative(-Infinity, NOW)).toBe('');
  });

  it('accepts a string timestamp', () => {
    const past = new Date(NOW - 120_000).toISOString();
    expect(formatRelative(past, NOW)).toBe('2m ago');
  });

  it('accepts a Date object', () => {
    const past = new Date(NOW - 3_600_000);
    expect(formatRelative(past, NOW)).toBe('1h ago');
  });

  it('handles string that is not a valid date', () => {
    expect(formatRelative('not-a-date', NOW)).toBe('');
  });

  it('returns "just now" for a tiny negative diff due to clock drift', () => {
    expect(formatRelative(NOW + 10, NOW)).toBe('just now');
  });
});
