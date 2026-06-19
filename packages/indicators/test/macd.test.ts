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

import { macd } from '../src/macd';
import { makeCandles } from './fixtures';

describe('macd', () => {
  it('returns full-null shape when not enough data', () => {
    const out = macd(makeCandles([1, 2, 3]), 12, 26, 9);
    expect(out).toHaveLength(3);
    for (const p of out) expect(p).toEqual({ macd: null, signal: null, hist: null });
  });

  it('computes macd with default 12/26/9 on a long series', () => {
    const closes: number[] = [];
    for (let i = 0; i < 60; i += 1) closes.push(100 + i + Math.sin(i / 3) * 5);
    const out = macd(makeCandles(closes), 12, 26, 9);
    const last = out.at(-1)!;
    expect(last.macd).not.toBeNull();
    expect(last.signal).not.toBeNull();
    expect(last.hist).not.toBeNull();
    // hist == macd - signal
    expect(last.hist!).toBeCloseTo(last.macd! - last.signal!, 10);
  });

  it('rejects fast >= slow', () => {
    expect(() => macd(makeCandles([1, 2, 3]), 12, 12, 9)).toThrow();
    expect(() => macd(makeCandles([1, 2, 3]), 26, 12, 9)).toThrow();
  });
});
