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

// Golden test for `synth4HFrom1H` — aggregates four consecutive 1H bars
// per UTC 4-hour bucket. Keep this test small and explicit so a regression
// in the bucket-boundary math fails loudly.

import { describe, expect, it } from 'vitest';

import { synth4HFrom1H, type FinnhubCandle } from '../src/providers/finnhub/rest';

function bar(tIsoUtc: string, o: number, h: number, l: number, c: number, v = 1): FinnhubCandle {
  return { t: new Date(tIsoUtc).getTime(), o, h, l, c, v };
}

describe('synth4HFrom1H', () => {
  it('aggregates four consecutive 1H bars in a 04:00–08:00 UTC bucket', () => {
    const bars: FinnhubCandle[] = [
      bar('2026-05-26T04:00:00Z', 100, 102, 99, 101),
      bar('2026-05-26T05:00:00Z', 101, 103, 100, 102),
      bar('2026-05-26T06:00:00Z', 102, 104, 101, 103.5),
      bar('2026-05-26T07:00:00Z', 103.5, 105, 102, 104),
    ];
    const out = synth4HFrom1H(bars);
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual({
      t: new Date('2026-05-26T04:00:00Z').getTime(),
      o: 100, // first open
      h: 105, // max high
      l: 99, // min low
      c: 104, // last close
      v: 4, // sum
    });
  });

  it('splits across UTC 4-hour bucket boundaries', () => {
    const bars: FinnhubCandle[] = [
      // 04–08 bucket
      bar('2026-05-26T04:00:00Z', 1, 2, 1, 2),
      bar('2026-05-26T05:00:00Z', 2, 3, 2, 3),
      // 08–12 bucket
      bar('2026-05-26T08:00:00Z', 5, 7, 5, 6),
      bar('2026-05-26T09:00:00Z', 6, 8, 6, 7),
    ];
    const out = synth4HFrom1H(bars);
    expect(out).toHaveLength(2);
    expect(out[0]?.t).toBe(new Date('2026-05-26T04:00:00Z').getTime());
    expect(out[1]?.t).toBe(new Date('2026-05-26T08:00:00Z').getTime());
    expect(out[0]?.o).toBe(1);
    expect(out[0]?.c).toBe(3);
    expect(out[1]?.o).toBe(5);
    expect(out[1]?.c).toBe(7);
    expect(out[1]?.h).toBe(8);
    expect(out[1]?.l).toBe(5);
  });

  it('emits a partial bucket when fewer than four bars fall inside', () => {
    const bars: FinnhubCandle[] = [
      bar('2026-05-26T04:00:00Z', 10, 12, 9, 11),
      bar('2026-05-26T05:00:00Z', 11, 13, 10, 12),
    ];
    const out = synth4HFrom1H(bars);
    expect(out).toHaveLength(1);
    expect(out[0]?.h).toBe(13);
    expect(out[0]?.l).toBe(9);
  });

  it('returns empty array on empty input', () => {
    expect(synth4HFrom1H([])).toEqual([]);
  });
});
