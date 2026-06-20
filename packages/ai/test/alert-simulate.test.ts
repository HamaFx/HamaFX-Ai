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

import { simulateAlert, type SimCandle } from '../src/alerts/simulate';

// Helper: build a candle with sensible defaults so each test
// only sets the fields that matter.
function c(t: number, o: number, h: number, l: number, c: number): SimCandle {
  return { t, o, h, l, c };
}

describe('simulateAlert — priceCross', () => {
  it('fires when a candle high reaches the level (direction=above)', () => {
    const candles: SimCandle[] = [
      c(1, 100, 105, 99, 102),
      c(2, 102, 110, 101, 108), // high 110 >= 110
      c(3, 108, 109, 107, 108),
    ];
    const r = simulateAlert(
      { type: 'priceCross', symbol: 'XAUUSD', level: 110, direction: 'above' },
      candles,
    );
    expect(r).not.toBeNull();
    expect(r!.fires).toEqual([{ at: 2, price: 110 }]);
  });

  it('fires when a candle low touches the level (direction=below)', () => {
    const candles: SimCandle[] = [
      c(1, 200, 205, 199, 201),
      c(2, 199, 200, 95, 96), // low 95 <= 95
    ];
    const r = simulateAlert(
      { type: 'priceCross', symbol: 'XAUUSD', level: 95, direction: 'below' },
      candles,
    );
    expect(r).not.toBeNull();
    expect(r!.fires).toEqual([{ at: 2, price: 95 }]);
  });

  it('returns no fires when the level is never reached', () => {
    const candles: SimCandle[] = [
      c(1, 100, 105, 99, 102),
      c(2, 102, 103, 101, 102),
      c(3, 102, 104, 101, 103),
    ];
    const r = simulateAlert(
      { type: 'priceCross', symbol: 'XAUUSD', level: 200, direction: 'above' },
      candles,
    );
    expect(r).not.toBeNull();
    expect(r!.fires).toEqual([]);
    expect(r!.avgHoldMs).toBe(0);
  });

  it('reports avgHoldMs between consecutive fires', () => {
    const candles: SimCandle[] = [
      c(0, 100, 110, 99, 105), // fires at t=0 (high 110 >= 110)
      c(100, 105, 109, 100, 108),
      c(200, 108, 111, 105, 110), // fires at t=200 (high 111 >= 110)
    ];
    const r = simulateAlert(
      { type: 'priceCross', symbol: 'XAUUSD', level: 110, direction: 'above' },
      candles,
    );
    expect(r).not.toBeNull();
    expect(r!.fires.length).toBe(2);
    expect(r!.avgHoldMs).toBe(200);
  });

  it('caps the fires array at maxFires', () => {
    const candles: SimCandle[] = Array.from({ length: 100 }, (_, i) =>
      c(i, 100, 200, 50, 150), // always fires
    );
    const r = simulateAlert(
      { type: 'priceCross', symbol: 'XAUUSD', level: 110, direction: 'above' },
      candles,
      { maxFires: 5 },
    );
    expect(r).not.toBeNull();
    expect(r!.fires).toHaveLength(5);
  });
});

describe('simulateAlert — candleClose', () => {
  it('fires when the candle close satisfies the rule (direction=above)', () => {
    const candles: SimCandle[] = [
      c(1, 100, 110, 100, 105),
      c(2, 105, 115, 104, 112), // close 112 >= 110
      c(3, 112, 113, 110, 109), // close 109 < 110 — should NOT fire
    ];
    const r = simulateAlert(
      { type: 'candleClose', symbol: 'XAUUSD', tf: '1h', level: 110, direction: 'above' },
      candles,
    );
    expect(r).not.toBeNull();
    expect(r!.fires).toEqual([{ at: 2, price: 112 }]);
  });

  it('uses the close price (not the high) for the recorded fire', () => {
    const candles: SimCandle[] = [
      c(1, 100, 200, 50, 95), // high 200 but close 95 (below 100)
    ];
    const r = simulateAlert(
      { type: 'candleClose', symbol: 'XAUUSD', tf: '1h', level: 100, direction: 'below' },
      candles,
    );
    expect(r).not.toBeNull();
    expect(r!.fires[0]?.price).toBe(95);
  });
});

describe('simulateAlert — indicatorCross', () => {
  it('returns null (not supported in v1)', () => {
    const candles: SimCandle[] = [c(1, 100, 105, 99, 102)];
    const r = simulateAlert(
      {
        type: 'indicatorCross',
        symbol: 'XAUUSD',
        tf: '1h',
        indicator: 'rsi:14',
        level: 70,
        direction: 'above',
      },
      candles,
    );
    expect(r).toBeNull();
  });
});
