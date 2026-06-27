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

// Tests for F1.4 — Backtest Engine.
// Pure logic tests: hit/miss/neutral, stop/target detection, direction, edge cases.

import { describe, expect, it } from 'vitest';

import { candlesToDailyBars, evaluateSignal } from './backtest-engine';
import type { SignalForEvaluation } from './types';
import { DEFAULT_EVAL_CONFIG } from '@hamafx/shared';

const CONFIG = DEFAULT_EVAL_CONFIG;

function makeSignal(overrides: Partial<SignalForEvaluation> = {}): SignalForEvaluation {
  return {
    id: 'test-signal-id',
    bias: 'bullish',
    anchorPrice: 2000,
    stopLoss: 1990,
    takeProfit: 2020,
    anchorAt: Date.now() - 10 * 24 * 60 * 60 * 1000,
    symbol: 'XAUUSD',
    ...overrides,
  };
}

function makeBar(high: number, low: number, close: number): { date: string; high: number; low: number; close: number } {
  return { date: '2026-01-01', high, low, close };
}

describe('evaluateSignal — unable cases', () => {
  it('returns unable when no forward bars', () => {
    const result = evaluateSignal(makeSignal(), [], CONFIG);
    expect(result).toEqual({ evalStatus: 'unable', reason: 'insufficient_forward_bars' });
  });

  it('returns unable when anchor price is zero', () => {
    const result = evaluateSignal(
      makeSignal({ anchorPrice: 0 }),
      [makeBar(2010, 2000, 2005)],
      CONFIG,
    );
    expect(result).toEqual({ evalStatus: 'unable', reason: 'invalid_anchor_price' });
  });

  it('returns unable when anchor price is negative', () => {
    const result = evaluateSignal(
      makeSignal({ anchorPrice: -1 }),
      [makeBar(2010, 2000, 2005)],
      CONFIG,
    );
    expect(result).toEqual({ evalStatus: 'unable', reason: 'invalid_anchor_price' });
  });
});

describe('evaluateSignal — bullish hit (target reached)', () => {
  it('returns hit when target is reached', () => {
    const bars = [
      makeBar(2015, 2005, 2010), // day 1: no hit
      makeBar(2025, 2010, 2022), // day 2: target hit (2025 >= 2020)
    ];
    const result = evaluateSignal(makeSignal(), bars, CONFIG);
    expect('outcome' in result).toBe(true);
    if ('outcome' in result) {
      expect(result.outcome).toBe('hit');
      expect(result.hitTakeProfit).toBe(true);
      expect(result.firstHit).toBe('target');
      expect(result.firstHitDays).toBe(2);
    }
  });

  it('returns hit when direction correct and beyond neutral band', () => {
    const bars = [
      makeBar(2010, 2005, 2008), // +0.4% — within neutral
      makeBar(2030, 2008, 2028), // +1.4% — beyond neutral, direction correct
    ];
    const result = evaluateSignal(
      makeSignal({ stopLoss: null, takeProfit: null }),
      bars,
      CONFIG,
    );
    if ('outcome' in result) {
      expect(result.outcome).toBe('hit');
      expect(result.directionCorrect).toBe(true);
      expect(result.hitTakeProfit).toBe(false);
    }
  });
});

describe('evaluateSignal — bearish hit (target reached)', () => {
  it('returns hit when target is reached for short', () => {
    const bars = [
      makeBar(1995, 1988, 1993), // day 1: target hit (1988 <= 1990)
    ];
    const result = evaluateSignal(
      makeSignal({ bias: 'bearish', stopLoss: 2010, takeProfit: 1990 }),
      bars,
      CONFIG,
    );
    if ('outcome' in result) {
      expect(result.outcome).toBe('hit');
      expect(result.hitTakeProfit).toBe(true);
      expect(result.firstHit).toBe('target');
      expect(result.firstHitDays).toBe(1);
    }
  });
});

describe('evaluateSignal — miss (stop hit)', () => {
  it('returns miss when stop is hit for bullish', () => {
    const bars = [
      makeBar(2005, 1988, 1992), // stop hit (1988 <= 1990)
    ];
    const result = evaluateSignal(makeSignal(), bars, CONFIG);
    if ('outcome' in result) {
      expect(result.outcome).toBe('miss');
      expect(result.hitStopLoss).toBe(true);
      expect(result.firstHit).toBe('stop');
    }
  });

  it('returns miss when stop is hit for bearish', () => {
    const bars = [
      makeBar(2012, 2005, 2008), // stop hit (2012 >= 2010)
    ];
    const result = evaluateSignal(
      makeSignal({ bias: 'bearish', stopLoss: 2010, takeProfit: 1990 }),
      bars,
      CONFIG,
    );
    if ('outcome' in result) {
      expect(result.outcome).toBe('miss');
      expect(result.hitStopLoss).toBe(true);
      expect(result.firstHit).toBe('stop');
    }
  });
});

describe('evaluateSignal — miss (wrong direction)', () => {
  it('returns miss when direction is wrong and beyond neutral band', () => {
    const bars = [
      makeBar(2005, 1995, 1997), // -0.15% — within neutral
      makeBar(1990, 1970, 1975), // -1.25% — beyond neutral, wrong direction for bullish
    ];
    const result = evaluateSignal(
      makeSignal({ stopLoss: null, takeProfit: null }),
      bars,
      CONFIG,
    );
    if ('outcome' in result) {
      expect(result.outcome).toBe('miss');
      expect(result.directionCorrect).toBe(false);
    }
  });
});

describe('evaluateSignal — neutral', () => {
  it('returns neutral when price stays within neutral band', () => {
    const bars = [
      makeBar(2005, 2000, 2003), // +0.15%
      makeBar(2008, 2002, 2005), // +0.25%
    ];
    const result = evaluateSignal(
      makeSignal({ stopLoss: null, takeProfit: null }),
      bars,
      CONFIG,
    );
    if ('outcome' in result) {
      expect(result.outcome).toBe('neutral');
      expect(Math.abs(result.priceReturnPct)).toBeLessThan(CONFIG.neutralBandPct);
    }
  });
});

describe('evaluateSignal — edge cases', () => {
  it('stop hit takes priority over target on same bar (conservative)', () => {
    // Bullish: bar hits both stop (low <= 1990) and target (high >= 2020)
    const bars = [
      makeBar(2025, 1988, 2000), // both hit on same bar
    ];
    const result = evaluateSignal(makeSignal(), bars, CONFIG);
    if ('outcome' in result) {
      // Stop is checked first, so it wins (conservative)
      expect(result.outcome).toBe('miss');
      expect(result.firstHit).toBe('stop');
    }
  });

  it('works with only stop loss (no take profit)', () => {
    const bars = [
      makeBar(2010, 2005, 2008),
      makeBar(2015, 2008, 2012), // +0.6% — within neutral
    ];
    const result = evaluateSignal(
      makeSignal({ takeProfit: null }),
      bars,
      CONFIG,
    );
    if ('outcome' in result) {
      expect(result.hitTakeProfit).toBe(false);
      expect(result.outcome).toBe('neutral');
    }
  });

  it('works with only take profit (no stop loss)', () => {
    const bars = [
      makeBar(2025, 2005, 2022), // target hit
    ];
    const result = evaluateSignal(
      makeSignal({ stopLoss: null }),
      bars,
      CONFIG,
    );
    if ('outcome' in result) {
      expect(result.hitTakeProfit).toBe(true);
      expect(result.outcome).toBe('hit');
    }
  });

  it('returns correct endPrice and priceReturnPct', () => {
    const bars = [
      makeBar(2010, 2005, 2008),
      makeBar(2015, 2008, 2012),
    ];
    const result = evaluateSignal(
      makeSignal({ stopLoss: null, takeProfit: null }),
      bars,
      CONFIG,
    );
    if ('outcome' in result) {
      expect(result.endPrice).toBe(2012);
      expect(result.priceReturnPct).toBeCloseTo(((2012 - 2000) / 2000) * 100, 5);
    }
  });
});

describe('candlesToDailyBars', () => {
  it('aggregates intraday candles into daily bars', () => {
    const candles = [
      { t: new Date('2026-01-01T08:00:00Z').getTime(), h: 2010, l: 2000, c: 2005 },
      { t: new Date('2026-01-01T16:00:00Z').getTime(), h: 2015, l: 2003, c: 2012 },
      { t: new Date('2026-01-02T08:00:00Z').getTime(), h: 2018, l: 2010, c: 2016 },
    ];
    const bars = candlesToDailyBars(candles);
    expect(bars).toHaveLength(2);
    expect(bars[0]!.date).toBe('2026-01-01');
    expect(bars[0]!.high).toBe(2015);
    expect(bars[0]!.low).toBe(2000);
    expect(bars[0]!.close).toBe(2012);
    expect(bars[1]!.date).toBe('2026-01-02');
    expect(bars[1]!.close).toBe(2016);
  });

  it('returns empty array for empty input', () => {
    expect(candlesToDailyBars([])).toEqual([]);
  });

  it('sorts bars by date', () => {
    const candles = [
      { t: new Date('2026-01-02T08:00:00Z').getTime(), h: 2018, l: 2010, c: 2016 },
      { t: new Date('2026-01-01T08:00:00Z').getTime(), h: 2010, l: 2000, c: 2005 },
    ];
    const bars = candlesToDailyBars(candles);
    expect(bars[0]!.date).toBe('2026-01-01');
    expect(bars[1]!.date).toBe('2026-01-02');
  });
});