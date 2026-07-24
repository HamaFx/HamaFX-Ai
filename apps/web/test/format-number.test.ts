// SPDX-License-Identifier: Apache-2.0
// @vitest-environment jsdom

import { describe, expect, it, vi, beforeEach } from 'vitest';

import {
  formatMs,
  formatNumber,
  formatRelativeTime,
  formatAbsoluteTime,
  downloadCSV,
} from '@/lib/format-number';

// ── formatMs ──────────────────────────────────────────────────────────

describe('formatMs', () => {
  it('returns "0ms" for zero', () => {
    expect(formatMs(0)).toBe('0ms');
  });

  it('returns ms for values under 1000', () => {
    expect(formatMs(1)).toBe('1ms');
    expect(formatMs(500)).toBe('500ms');
    expect(formatMs(999)).toBe('999ms');
    expect(formatMs(999.6)).toBe('1000ms'); // rounds to nearest ms
  });

  it('converts to seconds at 1000ms', () => {
    expect(formatMs(1000)).toBe('1.0s');
  });

  it('shows one decimal place for seconds', () => {
    expect(formatMs(1500)).toBe('1.5s');
    expect(formatMs(2345)).toBe('2.3s');
    expect(formatMs(2999)).toBe('3.0s');
  });

  it('handles large durations', () => {
    expect(formatMs(60_000)).toBe('60.0s');
    expect(formatMs(1_234_567)).toBe('1234.6s');
  });
});

// ── formatNumber ──────────────────────────────────────────────────────

describe('formatNumber', () => {
  it('formats small numbers without separators', () => {
    expect(formatNumber(0)).toBe('0');
    expect(formatNumber(999)).toBe('999');
  });

  it('adds thousands separators', () => {
    expect(formatNumber(1_000)).toBe('1,000');
    expect(formatNumber(1_234_567)).toBe('1,234,567');
  });
});

// ── formatRelativeTime ────────────────────────────────────────────────

describe('formatRelativeTime', () => {
  const NOW = new Date('2026-07-24T12:00:00Z').getTime();

  it('returns empty string for non-finite timestamps', () => {
    expect(formatRelativeTime('not-a-date', NOW)).toBe('');
    expect(formatRelativeTime('', NOW)).toBe('');
  });

  it('returns "just now" for timestamps in the future (clock skew)', () => {
    const future = new Date(NOW + 30_000).toISOString();
    expect(formatRelativeTime(future, NOW)).toBe('just now');
  });

  it('returns seconds for <1 minute ago', () => {
    const fiveSecondsAgo = new Date(NOW - 5_000).toISOString();
    expect(formatRelativeTime(fiveSecondsAgo, NOW)).toBe('5s ago');

    const fiftyNineSecondsAgo = new Date(NOW - 59_000).toISOString();
    expect(formatRelativeTime(fiftyNineSecondsAgo, NOW)).toBe('59s ago');
  });

  it('returns minutes for 1–59 minutes ago', () => {
    const oneMinAgo = new Date(NOW - 60_000).toISOString();
    expect(formatRelativeTime(oneMinAgo, NOW)).toBe('1m ago');

    const fiftyNineMinAgo = new Date(NOW - 59 * 60_000).toISOString();
    expect(formatRelativeTime(fiftyNineMinAgo, NOW)).toBe('59m ago');
  });

  it('returns hours for 1–23 hours ago', () => {
    const oneHourAgo = new Date(NOW - 3_600_000).toISOString();
    expect(formatRelativeTime(oneHourAgo, NOW)).toBe('1h ago');

    const twentyThreeHoursAgo = new Date(NOW - 23 * 3_600_000).toISOString();
    expect(formatRelativeTime(twentyThreeHoursAgo, NOW)).toBe('23h ago');
  });

  it('returns days for 1–29 days ago', () => {
    const oneDayAgo = new Date(NOW - 86_400_000).toISOString();
    expect(formatRelativeTime(oneDayAgo, NOW)).toBe('1d ago');

    const twentyNineDaysAgo = new Date(NOW - 29 * 86_400_000).toISOString();
    expect(formatRelativeTime(twentyNineDaysAgo, NOW)).toBe('29d ago');
  });

  it('returns short date for 30+ days ago', () => {
    const thirtyDaysAgo = new Date(NOW - 30 * 86_400_000).toISOString();
    const result = formatRelativeTime(thirtyDaysAgo, NOW);
    // Should be a short date like "Jun 24" (not a relative string)
    expect(result).toMatch(/^[A-Z][a-z]{2} \d{1,2}$/);
  });
});

// ── formatAbsoluteTime ────────────────────────────────────────────────

describe('formatAbsoluteTime', () => {
  it('produces a full locale string with year, month, day, time', () => {
    const result = formatAbsoluteTime('2026-07-24T12:30:00Z');
    expect(result).toContain('2026');
    expect(result).toContain('Jul');
    expect(result).toContain('24');
    // Time format varies by locale but should contain digits and colon
    expect(result).toMatch(/\d{1,2}:\d{2}/);
  });
});

// ── downloadCSV ───────────────────────────────────────────────────────

describe('downloadCSV', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // jsdom does not provide URL.createObjectURL; polyfill it before spying.
    if (!URL.createObjectURL) {
      URL.createObjectURL = vi.fn().mockReturnValue('blob:test');
    }
    if (!URL.revokeObjectURL) {
      URL.revokeObjectURL = vi.fn();
    }
  });

  it('does nothing for empty rows', () => {
    const createElementSpy = vi.spyOn(document, 'createElement');
    downloadCSV([], 'test.csv');
    expect(createElementSpy).not.toHaveBeenCalled();
  });

  it('triggers a download for non-empty rows and handles special values', () => {
    const clickSpy = vi.fn();
    const url = 'blob:test';

    vi.spyOn(URL, 'createObjectURL').mockReturnValue(url);
    vi.spyOn(URL, 'revokeObjectURL');

    const anchorSpy = { href: '', download: '', click: clickSpy };
    vi.spyOn(document, 'createElement').mockReturnValue(anchorSpy as unknown as HTMLElement);

    downloadCSV(
      [
        { name: 'Doe, John', role: 'admin' },
        { name: 'Bob', role: null, extra: undefined },
      ],
      'users.csv',
    );

    expect(URL.createObjectURL).toHaveBeenCalled();
    expect(clickSpy).toHaveBeenCalled();
    expect(anchorSpy.download).toBe('users.csv');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(url);
  });
});
