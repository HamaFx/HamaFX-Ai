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

import { isInSnooze } from '../src/alerts/persistence';

const NOW = 1_700_000_000_000;
const HOUR = 3_600_000;

describe('Phase C item 17 — isInSnooze (pure gate)', () => {
  it('returns false when lastFiredAt is null (never fired)', () => {
    expect(
      isInSnooze({ lastFiredAt: null, snoozeHours: 4 }, NOW),
    ).toBe(false);
  });

  it('returns false when lastFiredAt is undefined (legacy row)', () => {
    expect(
      isInSnooze({ lastFiredAt: undefined, snoozeHours: 4 }, NOW),
    ).toBe(false);
  });

  it('returns false when snoozeHours is 0 (one-shot)', () => {
    expect(
      isInSnooze({ lastFiredAt: NOW - HOUR, snoozeHours: 0 }, NOW),
    ).toBe(false);
  });

  it('returns false when snoozeHours is null/undefined', () => {
    expect(
      isInSnooze({ lastFiredAt: NOW - HOUR, snoozeHours: null }, NOW),
    ).toBe(false);
    expect(
      isInSnooze({ lastFiredAt: NOW - HOUR, snoozeHours: undefined }, NOW),
    ).toBe(false);
  });

  it('returns true when the snooze window has not yet elapsed', () => {
    // Fired 1 hour ago, snooze is 4 hours → still snoozed.
    expect(
      isInSnooze({ lastFiredAt: NOW - 1 * HOUR, snoozeHours: 4 }, NOW),
    ).toBe(true);
  });

  it('returns false when the snooze window has elapsed exactly', () => {
    // Fired 4 hours ago, snooze is 4 hours → ready to re-fire.
    expect(
      isInSnooze({ lastFiredAt: NOW - 4 * HOUR, snoozeHours: 4 }, NOW),
    ).toBe(false);
  });

  it('returns false when well past the snooze window', () => {
    expect(
      isInSnooze({ lastFiredAt: NOW - 24 * HOUR, snoozeHours: 4 }, NOW),
    ).toBe(false);
  });

  it('handles the boundary "just past" cleanly', () => {
    // Fired 4h + 1ms ago, snooze is 4h → past the window.
    expect(
      isInSnooze({ lastFiredAt: NOW - (4 * HOUR + 1), snoozeHours: 4 }, NOW),
    ).toBe(false);
    // Fired 3h 59m 59s ago, snooze is 4h → still snoozed.
    expect(
      isInSnooze({ lastFiredAt: NOW - (4 * HOUR - 1), snoozeHours: 4 }, NOW),
    ).toBe(true);
  });

  it('handles the maximum snooze (168 hours = 1 week)', () => {
    // 167h 59m past a 168h snooze → still snoozed.
    expect(
      isInSnooze({ lastFiredAt: NOW - (168 * HOUR - 1), snoozeHours: 168 }, NOW),
    ).toBe(true);
    // 168h 1m past → ready.
    expect(
      isInSnooze({ lastFiredAt: NOW - (168 * HOUR + 60_000), snoozeHours: 168 }, NOW),
    ).toBe(false);
  });
});
