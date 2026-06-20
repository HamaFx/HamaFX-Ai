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

import { getSessionInfo } from '../src/lib/session';

/**
 * Helper to build a UTC Date at a specific (year, month-1, day, hour, minute).
 * Months are 0-indexed so callers can write 6 for July.
 */
function utc(year: number, month: number, day: number, hour: number, minute = 0): Date {
  return new Date(Date.UTC(year, month, day, hour, minute, 0));
}

describe('getSessionInfo — UTC-anchored session cuts', () => {
  it('classifies 03:00 UTC Wednesday as Asian', () => {
    const d = utc(2026, 5, 17, 3); // Wed Jun 17 2026 03:00 UTC
    expect(getSessionInfo(d)).toEqual({
      session: 'asian',
      label: 'Asian',
      weekday: 3,
    });
  });

  it('classifies 10:00 UTC Wednesday as London', () => {
    const d = utc(2026, 5, 17, 10);
    expect(getSessionInfo(d).session).toBe('london');
  });

  it('classifies 14:00 UTC Wednesday as NY', () => {
    const d = utc(2026, 5, 17, 14);
    expect(getSessionInfo(d).session).toBe('ny');
  });

  it('classifies 20:00 UTC Wednesday as Closed', () => {
    const d = utc(2026, 5, 17, 20);
    expect(getSessionInfo(d).session).toBe('closed');
  });

  it('boundary 06:59 UTC is still Asian', () => {
    const d = utc(2026, 5, 17, 6, 59);
    expect(getSessionInfo(d).session).toBe('asian');
  });

  it('boundary 07:00 UTC flips to London', () => {
    const d = utc(2026, 5, 17, 7);
    expect(getSessionInfo(d).session).toBe('london');
  });

  it('boundary 11:59 UTC is still London', () => {
    const d = utc(2026, 5, 17, 11, 59);
    expect(getSessionInfo(d).session).toBe('london');
  });

  it('boundary 12:00 UTC flips to NY', () => {
    const d = utc(2026, 5, 17, 12);
    expect(getSessionInfo(d).session).toBe('ny');
  });

  it('boundary 16:59 UTC is still NY', () => {
    const d = utc(2026, 5, 17, 16, 59);
    expect(getSessionInfo(d).session).toBe('ny');
  });

  it('boundary 17:00 UTC flips to Closed', () => {
    const d = utc(2026, 5, 17, 17);
    expect(getSessionInfo(d).session).toBe('closed');
  });

  it('00:00 UTC is Asian (the midnight roll-over)', () => {
    const d = utc(2026, 5, 17, 0);
    expect(getSessionInfo(d).session).toBe('asian');
  });
});

describe('getSessionInfo — weekend window', () => {
  it('classifies Saturday 12:00 UTC as Weekend', () => {
    // 2026-06-20 is a Saturday
    const d = utc(2026, 5, 20, 12);
    expect(getSessionInfo(d).session).toBe('weekend');
  });

  it('classifies Sunday 12:00 UTC as Weekend', () => {
    // 2026-06-21 is a Sunday
    const d = utc(2026, 5, 21, 12);
    expect(getSessionInfo(d).session).toBe('weekend');
  });

  it('Friday 21:59 UTC is still in the regular Friday session', () => {
    // 2026-06-19 is a Friday; 21:59 UTC is NY closing time.
    const d = utc(2026, 5, 19, 21, 59);
    expect(getSessionInfo(d).session).not.toBe('weekend');
  });

  it('Friday 22:00 UTC starts the weekend window', () => {
    const d = utc(2026, 5, 19, 22);
    expect(getSessionInfo(d).session).toBe('weekend');
  });

  it('Sunday 21:59 UTC is still Weekend', () => {
    const d = utc(2026, 5, 21, 21, 59);
    expect(getSessionInfo(d).session).toBe('weekend');
  });

  it('Sunday 22:00 UTC ends the weekend window (Closed gap before Asia)', () => {
    // The weekend boundary is exclusive at the end. The first two
    // hours after the weekend (22:00 – 23:59 UTC Sunday) are a
    // genuine closed gap before Asian session opens at 00:00 UTC.
    const d = utc(2026, 5, 21, 22);
    expect(getSessionInfo(d).session).toBe('closed');
    expect(getSessionInfo(d).weekday).toBe(0); // Still Sunday in UTC.
  });
});

describe('getSessionInfo — weekday field', () => {
  it('reports Monday (weekday=1) on a Monday', () => {
    // 2026-06-15 is a Monday
    const d = utc(2026, 5, 15, 10);
    expect(getSessionInfo(d).weekday).toBe(1);
  });

  it('reports Sunday (weekday=0) on a Sunday', () => {
    const d = utc(2026, 5, 21, 23);
    expect(getSessionInfo(d).weekday).toBe(0);
  });
});
