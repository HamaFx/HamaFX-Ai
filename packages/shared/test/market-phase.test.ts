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
  getMarketPhase,
  isForexWeekend,
  isComexOpen,
  describeMarketPhase,
  getSignalTtlMinutes,
} from '../src/market-phase';

// Helper: create a Date at a specific UTC day/hour/minute.
function utcDate(day: number, hour: number, minute: number = 0): Date {
  // day: 0=Sunday, 1=Monday, ..., 5=Friday, 6=Saturday
  // Use a fixed date in June 2026 (known month) and set the day.
  const d = new Date(Date.UTC(2026, 5, 7 + day, hour, minute, 0));
  return d;
}

describe('isForexWeekend', () => {
  it('returns true on Saturday', () => {
    expect(isForexWeekend(utcDate(6, 12))).toBe(true);
  });

  it('returns true on Sunday before 22:00 UTC', () => {
    expect(isForexWeekend(utcDate(0, 10))).toBe(true);
    expect(isForexWeekend(utcDate(0, 21, 59))).toBe(true);
  });

  it('returns false on Sunday at/after 22:00 UTC', () => {
    expect(isForexWeekend(utcDate(0, 22))).toBe(false);
    expect(isForexWeekend(utcDate(0, 23))).toBe(false);
  });

  it('returns true on Friday at/after 22:00 UTC', () => {
    expect(isForexWeekend(utcDate(5, 22))).toBe(true);
    expect(isForexWeekend(utcDate(5, 23))).toBe(true);
  });

  it('returns false on Friday before 22:00 UTC', () => {
    expect(isForexWeekend(utcDate(5, 21))).toBe(false);
    expect(isForexWeekend(utcDate(5, 12))).toBe(false);
  });

  it('returns false on weekdays (Mon-Thu)', () => {
    expect(isForexWeekend(utcDate(1, 12))).toBe(false);
    expect(isForexWeekend(utcDate(2, 0))).toBe(false);
    expect(isForexWeekend(utcDate(3, 23))).toBe(false);
    expect(isForexWeekend(utcDate(4, 6))).toBe(false);
  });
});

describe('isComexOpen', () => {
  it('returns false during forex weekend (Saturday)', () => {
    expect(isComexOpen(utcDate(6, 12))).toBe(false);
  });

  it('returns false on Sunday before 18:00 UTC', () => {
    expect(isComexOpen(utcDate(0, 17))).toBe(false);
  });

  it('returns true on Sunday at/after 18:00 UTC', () => {
    expect(isComexOpen(utcDate(0, 19))).toBe(true);
  });

  it('returns false during daily maintenance pause (17:00 UTC)', () => {
    expect(isComexOpen(utcDate(1, 17))).toBe(false);
  });

  it('returns true during normal trading hours', () => {
    expect(isComexOpen(utcDate(1, 10))).toBe(true);
    expect(isComexOpen(utcDate(3, 14))).toBe(true);
  });
});

describe('getMarketPhase — session detection', () => {
  it('detects London/NY Overlap (13:00-17:00 UTC)', () => {
    const phase = getMarketPhase(utcDate(1, 14));
    expect(phase.session).toBe('london_ny_overlap');
    expect(phase.liquidity).toBe('high');
    expect(phase.isOpen).toBe(true);
  });

  it('detects London session (08:00-13:00 UTC)', () => {
    const phase = getMarketPhase(utcDate(1, 10));
    expect(phase.session).toBe('london');
    expect(phase.liquidity).toBe('high');
    expect(phase.isOpen).toBe(true);
  });

  it('detects New York session (17:00-22:00 UTC)', () => {
    const phase = getMarketPhase(utcDate(1, 19));
    expect(phase.session).toBe('newyork');
    expect(phase.liquidity).toBe('high');
    expect(phase.isOpen).toBe(true);
  });

  it('detects Tokyo session (00:00-08:00 UTC)', () => {
    const phase = getMarketPhase(utcDate(1, 3));
    expect(phase.session).toBe('tokyo');
    expect(phase.liquidity).toBe('medium');
    expect(phase.isOpen).toBe(true);
  });

  it('detects Sydney session (22:00-00:00 UTC)', () => {
    const phase = getMarketPhase(utcDate(1, 23));
    expect(phase.session).toBe('sydney');
    expect(phase.liquidity).toBe('low');
    expect(phase.isOpen).toBe(true);
  });

  it('detects closed market on Saturday', () => {
    const phase = getMarketPhase(utcDate(6, 12));
    expect(phase.session).toBe('closed');
    expect(phase.liquidity).toBe('low');
    expect(phase.isOpen).toBe(false);
  });

  it('detects closed market on Sunday before 22:00', () => {
    const phase = getMarketPhase(utcDate(0, 10));
    expect(phase.session).toBe('closed');
    expect(phase.isOpen).toBe(false);
  });

  it('detects closed market on Friday after 22:00', () => {
    const phase = getMarketPhase(utcDate(5, 23));
    expect(phase.session).toBe('closed');
    expect(phase.isOpen).toBe(false);
  });
});

describe('getMarketPhase — nextSessionChange', () => {
  it('returns a valid next session change when market is open', () => {
    const phase = getMarketPhase(utcDate(1, 10)); // London
    expect(phase.nextSessionChange).toBeDefined();
    expect(phase.nextSessionChange.session).toBeTruthy();
    expect(phase.nextSessionChange.inMinutes).toBeGreaterThan(0);
  });

  it('returns next session when market is closed (weekend)', () => {
    const phase = getMarketPhase(utcDate(6, 12)); // Saturday
    expect(phase.nextSessionChange).toBeDefined();
    expect(phase.nextSessionChange.session).toBe('sydney');
    expect(phase.nextSessionChange.inMinutes).toBeGreaterThan(0);
  });
});

describe('getMarketPhase — goldSpecific', () => {
  it('includes COMEX status when market is open', () => {
    const phase = getMarketPhase(utcDate(1, 14));
    expect(phase.goldSpecific).toBeDefined();
    expect(typeof phase.goldSpecific!.comexOpen).toBe('boolean');
  });

  it('sets comexOpen to false during weekend', () => {
    const phase = getMarketPhase(utcDate(6, 12));
    expect(phase.goldSpecific).toBeDefined();
    expect(phase.goldSpecific!.comexOpen).toBe(false);
  });

  it('sets comexOpen to false during maintenance pause', () => {
    const phase = getMarketPhase(utcDate(1, 17));
    expect(phase.goldSpecific!.comexOpen).toBe(false);
  });
});

describe('describeMarketPhase — human-readable output', () => {
  it('describes closed market', () => {
    const phase = getMarketPhase(utcDate(6, 12));
    const desc = describeMarketPhase(phase);
    expect(desc).toContain('CLOSED');
    expect(desc).toContain('weekend');
  });

  it('describes London/NY Overlap with high liquidity note', () => {
    const phase = getMarketPhase(utcDate(1, 14));
    const desc = describeMarketPhase(phase);
    expect(desc).toContain('London/NY Overlap');
    expect(desc).toContain('high liquidity');
    expect(desc).toContain('XAUUSD');
  });

  it('describes Sydney with low liquidity note', () => {
    const phase = getMarketPhase(utcDate(1, 23));
    const desc = describeMarketPhase(phase);
    expect(desc).toContain('Sydney');
    expect(desc).toContain('low liquidity');
  });

  it('includes next session change info', () => {
    const phase = getMarketPhase(utcDate(1, 10));
    const desc = describeMarketPhase(phase);
    expect(desc).toContain('Next session change');
    expect(desc).toContain('min');
  });

  it('includes COMEX status when available', () => {
    const phase = getMarketPhase(utcDate(1, 14));
    const desc = describeMarketPhase(phase);
    expect(desc).toContain('COMEX');
  });
});

describe('getSignalTtlMinutes — signal TTL by session', () => {
  it('returns 0 when market is closed', () => {
    const phase = getMarketPhase(utcDate(6, 12));
    expect(getSignalTtlMinutes(phase)).toBe(0);
  });

  it('returns 240 (4h) for London/NY Overlap', () => {
    const phase = getMarketPhase(utcDate(1, 14));
    expect(getSignalTtlMinutes(phase)).toBe(240);
  });

  it('returns 180 (3h) for London', () => {
    const phase = getMarketPhase(utcDate(1, 10));
    expect(getSignalTtlMinutes(phase)).toBe(180);
  });

  it('returns 180 (3h) for New York', () => {
    const phase = getMarketPhase(utcDate(1, 19));
    expect(getSignalTtlMinutes(phase)).toBe(180);
  });

  it('returns 90 (1.5h) for Tokyo', () => {
    const phase = getMarketPhase(utcDate(1, 3));
    expect(getSignalTtlMinutes(phase)).toBe(90);
  });

  it('returns 60 (1h) for Sydney', () => {
    const phase = getMarketPhase(utcDate(1, 23));
    expect(getSignalTtlMinutes(phase)).toBe(60);
  });
});