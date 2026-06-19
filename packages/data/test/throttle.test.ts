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

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { _resetThrottle, noteBackoff, tryReserve } from '../src/cache/throttle';

describe('tryReserve', () => {
  beforeEach(() => {
    _resetThrottle();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-26T00:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows up to limit calls per window then denies', async () => {
    const cfg = { limit: 3, windowMs: 1000 };
    expect(await tryReserve('p', cfg)).toBe(true);
    expect(await tryReserve('p', cfg)).toBe(true);
    expect(await tryReserve('p', cfg)).toBe(true);
    expect(await tryReserve('p', cfg)).toBe(false);
  });

  it('rolls the window forward', async () => {
    const cfg = { limit: 1, windowMs: 1000 };
    expect(await tryReserve('p', cfg)).toBe(true);
    expect(await tryReserve('p', cfg)).toBe(false);
    vi.advanceTimersByTime(1001);
    expect(await tryReserve('p', cfg)).toBe(true);
  });

  it('keeps separate buckets per provider', async () => {
    const cfg = { limit: 1, windowMs: 1000 };
    expect(await tryReserve('a', cfg)).toBe(true);
    expect(await tryReserve('b', cfg)).toBe(true);
    expect(await tryReserve('a', cfg)).toBe(false);
    expect(await tryReserve('b', cfg)).toBe(false);
  });
});


describe('adaptive throttle — Phase 7a backoff', () => {
  beforeEach(() => {
    _resetThrottle();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('lowers the effective cap after noteBackoff() is called', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-26T00:00:00Z'));

    const cfg = { limit: 10, windowMs: 60_000, backoffFraction: 0.5, cooloffMs: 30_000 };
    // Plain limit allows 10 calls.
    let allowed = 0;
    for (let i = 0; i < 12; i += 1) if (await tryReserve('p', cfg)) allowed += 1;
    expect(allowed).toBe(10);

    // Reset, then signal backoff — limit should fall to 5.
    _resetThrottle();
    await noteBackoff('p', cfg);
    let allowedAfter = 0;
    for (let i = 0; i < 12; i += 1) if (await tryReserve('p', cfg)) allowedAfter += 1;
    expect(allowedAfter).toBe(5);

    // Past cooloff, the cap recovers.
    _resetThrottle();
    await noteBackoff('p', cfg);
    vi.advanceTimersByTime(31_000);
    let allowedRecovered = 0;
    for (let i = 0; i < 12; i += 1) if (await tryReserve('p', cfg)) allowedRecovered += 1;
    expect(allowedRecovered).toBe(10);
  });
});
