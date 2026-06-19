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

import { decideCross } from '../src/alerts/evaluator';

describe('decideCross', () => {
  it('does not fire on the very first tick (no baseline)', () => {
    expect(decideCross('above', null, 75, 70)).toBe(false);
    expect(decideCross('above', undefined, 75, 70)).toBe(false);
    expect(decideCross('below', null, 30, 35)).toBe(false);
  });

  it('fires when the value crosses above the level', () => {
    // prev was below, curr is at/above → fire
    expect(decideCross('above', 60, 71, 70)).toBe(true);
    expect(decideCross('above', 69.99, 70, 70)).toBe(true);
  });

  it('does not fire when both prev and curr are above the level', () => {
    // already met when alert was created → wait for it to drop and re-cross.
    expect(decideCross('above', 75, 80, 70)).toBe(false);
  });

  it('does not fire when curr stays below the level', () => {
    expect(decideCross('above', 60, 65, 70)).toBe(false);
  });

  it('fires when the value crosses below the level', () => {
    expect(decideCross('below', 40, 29, 30)).toBe(true);
    expect(decideCross('below', 30.01, 30, 30)).toBe(true);
  });

  it('does not fire when both prev and curr are below the level', () => {
    expect(decideCross('below', 25, 20, 30)).toBe(false);
  });

  it('does not fire when curr stays above the level', () => {
    expect(decideCross('below', 50, 45, 30)).toBe(false);
  });

  it('full lifecycle: created above the level, drops, then crosses back up', () => {
    // tick 1: prev=null, curr=75, level=70, dir=above → no fire (seed).
    expect(decideCross('above', null, 75, 70)).toBe(false);
    // tick 2: prev=75, curr=60 → no fire.
    expect(decideCross('above', 75, 60, 70)).toBe(false);
    // tick 3: prev=60, curr=71 → fire.
    expect(decideCross('above', 60, 71, 70)).toBe(true);
  });
});
