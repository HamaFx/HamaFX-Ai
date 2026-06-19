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

import { _resetHealth, getHealth, getScore, recordFailure, recordSuccess } from '../src/health';

describe('provider health — Phase 7a', () => {
  beforeEach(() => {
    _resetHealth();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('reports neutral score with no samples', () => {
    expect(getScore('twelve-data')).toBe(0.5);
  });

  it('drops to ~0 after consecutive failures, recovers on a success', () => {
    recordFailure('twelve-data');
    recordFailure('twelve-data');
    recordFailure('twelve-data');
    expect(getHealth('twelve-data').failureRate).toBeCloseTo(1);
    expect(getScore('twelve-data')).toBe(0);

    recordSuccess('twelve-data');
    const h = getHealth('twelve-data');
    expect(h.ok).toBe(1);
    expect(h.failed).toBe(3);
    // 1/4 success → 0.25 score (1 - 0.75)
    expect(getScore('twelve-data')).toBeCloseTo(0.25);
  });

  it('forgets samples older than the 5-minute window', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-26T00:00:00Z'));
    recordFailure('twelve-data');
    expect(getHealth('twelve-data').samples).toBe(1);

    vi.advanceTimersByTime(6 * 60 * 1000); // 6 minutes
    expect(getHealth('twelve-data').samples).toBe(0);
    expect(getScore('twelve-data')).toBe(0.5);
  });
});
