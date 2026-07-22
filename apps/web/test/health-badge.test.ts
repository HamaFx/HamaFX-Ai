// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';

import { getHealthTone } from '../src/components/ui/health-tone';

const NOW = new Date('2026-06-20T12:00:00.000Z');
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

describe('getHealthTone — provider health badge logic', () => {
  it('returns "grey" when no health snapshot exists', () => {
    expect(getHealthTone(undefined, NOW)).toBe('grey');
  });

  it('returns "red" on any failed test (regardless of age)', () => {
    const justNow = new Date(NOW.getTime() - 5 * 60_000); // 5 minutes ago
    expect(getHealthTone({ ok: false, error: 'HTTP 401', testedAt: justNow.toISOString() }, NOW)).toBe(
      'red',
    );
  });

  it('returns "red" for a stale failure too — failures are sticky', () => {
    const tenDaysAgo = new Date(NOW.getTime() - 10 * DAY);
    expect(getHealthTone({ ok: false, error: 'rate limited', testedAt: tenDaysAgo.toISOString() }, NOW)).toBe(
      'red',
    );
  });

  it('returns "green" for a successful test in the last 24 hours', () => {
    const oneHourAgo = new Date(NOW.getTime() - 1 * HOUR);
    expect(getHealthTone({ ok: true, error: null, testedAt: oneHourAgo.toISOString() }, NOW)).toBe(
      'green',
    );
  });

  it('boundary: just under 24h is still green', () => {
    const almostOneDay = new Date(NOW.getTime() - (24 * HOUR - 1));
    expect(getHealthTone({ ok: true, error: null, testedAt: almostOneDay.toISOString() }, NOW)).toBe(
      'green',
    );
  });

  it('boundary: exactly 24h flips to yellow', () => {
    const exactlyOneDay = new Date(NOW.getTime() - 24 * HOUR);
    expect(getHealthTone({ ok: true, error: null, testedAt: exactlyOneDay.toISOString() }, NOW)).toBe(
      'yellow',
    );
  });

  it('returns "yellow" between 24h and 7 days', () => {
    const threeDaysAgo = new Date(NOW.getTime() - 3 * DAY);
    expect(getHealthTone({ ok: true, error: null, testedAt: threeDaysAgo.toISOString() }, NOW)).toBe(
      'yellow',
    );
  });

  it('boundary: just under 7 days is still yellow', () => {
    const almostSevenDays = new Date(NOW.getTime() - (7 * DAY - 1));
    expect(getHealthTone({ ok: true, error: null, testedAt: almostSevenDays.toISOString() }, NOW)).toBe(
      'yellow',
    );
  });

  it('boundary: exactly 7 days flips to grey (treat as unknown)', () => {
    const exactlySevenDays = new Date(NOW.getTime() - 7 * DAY);
    expect(getHealthTone({ ok: true, error: null, testedAt: exactlySevenDays.toISOString() }, NOW)).toBe(
      'grey',
    );
  });

  it('returns "grey" for a successful test older than 7 days', () => {
    const thirtyDaysAgo = new Date(NOW.getTime() - 30 * DAY);
    expect(getHealthTone({ ok: true, error: null, testedAt: thirtyDaysAgo.toISOString() }, NOW)).toBe(
      'grey',
    );
  });

  it('handles an invalid testedAt by treating as "grey" (never tested)', () => {
    // NaN propagates through getTime(), so ageMs is NaN. Comparisons
    // with NaN return false, so we fall through to the "very stale"
    // branch and return 'grey'. This is the safe default.
    expect(getHealthTone({ ok: true, error: null, testedAt: 'not-a-date' }, NOW)).toBe('grey');
  });
});
