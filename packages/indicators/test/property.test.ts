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

import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import type { Candle } from '@hamafx/shared';

import { atr } from '../src/atr';
import { bollinger } from '../src/bollinger';
import { macd } from '../src/macd';
import { ema, sma } from '../src/moving-averages';
import { classicPivots, pivotsAligned } from '../src/pivots';
import { rsi } from '../src/rsi';
import { closes, highs, lows, mean, padFront, stdev } from '../src/util';

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

const priceArb = fc.double({ min: 0.01, max: 1_000_000, noDefaultInfinity: true, noNaN: true });
const spreadArb = fc.double({ min: 0.001, max: 100, noDefaultInfinity: true, noNaN: true });

const candleArb: fc.Arbitrary<Candle> = priceArb.chain((close) =>
  spreadArb.map((spread) => ({
    symbol: 'XAUUSD' as const,
    tf: '1h' as const,
    t: 0,
    o: close,
    h: close + spread,
    l: close - spread,
    c: close,
    v: null,
    source: 'test',
    fetchedAt: 0,
  })),
);

/** Minimal period that at least 1 candle will survive the null-pad. */
function validPeriod(length: number, min = 1): number {
  const hi = Math.max(min, Math.floor(length / 3));
  return hi < 2 ? 2 : Math.min(hi, 100);
}

/** Length for which the indicator has enough data. */
function sufficientLength(period: number): number {
  return period + 5;
}

// ---------------------------------------------------------------------------
// RSI
// ---------------------------------------------------------------------------

describe('rsi (property)', () => {
  it('always returns values in [0, 100]', () =>
    fc.assert(
      fc.property(fc.array(candleArb, { minLength: 16, maxLength: 200 }), (candles) => {
        const out = rsi(candles);
        for (const v of out) {
          if (v !== null) {
            expect(v).toBeGreaterThanOrEqual(0);
            expect(v).toBeLessThanOrEqual(100);
          }
        }
      }),
    ));

  it('output length matches input length', () =>
    fc.assert(
      fc.property(fc.array(candleArb, { minLength: 1, maxLength: 200 }), (candles) => {
        expect(rsi(candles)).toHaveLength(candles.length);
      }),
    ));

  it('first period entries are null', () =>
    fc.assert(
      fc.property(
        fc
          .integer({ min: 2, max: 50 })
          .chain((period) =>
            fc
              .array(candleArb, { minLength: sufficientLength(period), maxLength: 200 })
              .map((candles) => ({ candles, period })),
          ),
        ({ candles, period }) => {
          const out = rsi(candles, period);
          for (let i = 0; i < period; i += 1) expect(out[i]).toBeNull();
          expect(out[period]).not.toBeNull();
        },
      ),
    ));
});

// ---------------------------------------------------------------------------
// Bollinger Bands
// ---------------------------------------------------------------------------

describe('bollinger (property)', () => {
  it('upper >= middle >= lower for non-null points', () =>
    fc.assert(
      fc.property(
        fc
          .integer({ min: 2, max: 50 })
          .chain((period) =>
            fc
              .array(candleArb, { minLength: sufficientLength(period), maxLength: 200 })
              .map((candles) => ({ candles, period })),
          ),
        ({ candles, period }) => {
          const out = bollinger(candles, period);
          for (const p of out) {
            if (p.upper !== null && p.middle !== null && p.lower !== null) {
              expect(p.upper).toBeGreaterThanOrEqual(p.middle);
              expect(p.middle).toBeGreaterThanOrEqual(p.lower);
            }
          }
        },
      ),
    ));

  it('output length matches input length', () =>
    fc.assert(
      fc.property(
        fc
          .integer({ min: 2, max: 50 })
          .chain((period) =>
            fc
              .array(candleArb, { minLength: 2, maxLength: 200 })
              .map((candles) => ({ candles, period })),
          ),
        ({ candles, period }) => {
          expect(bollinger(candles, period)).toHaveLength(candles.length);
        },
      ),
    ));
});

// ---------------------------------------------------------------------------
// SMA
// ---------------------------------------------------------------------------

describe('sma (property)', () => {
  it('output length matches input length', () =>
    fc.assert(
      fc.property(fc.array(candleArb, { minLength: 1, maxLength: 200 }), (candles) => {
        const period = validPeriod(candles.length);
        expect(sma(candles, period)).toHaveLength(candles.length);
      }),
    ));

  it('non-null count matches length - period + 1 (when sufficient data)', () =>
    fc.assert(
      fc.property(
        fc
          .integer({ min: 2, max: 50 })
          .chain((period) =>
            fc
              .array(candleArb, { minLength: sufficientLength(period), maxLength: 200 })
              .map((candles) => ({ candles, period })),
          ),
        ({ candles, period }) => {
          const out = sma(candles, period);
          const nonNull = out.filter((v) => v !== null).length;
          expect(nonNull).toBe(candles.length - period + 1);
        },
      ),
    ));

  it('all-null when length < period', () =>
    fc.assert(
      fc.property(
        fc
          .integer({ min: 2, max: 50 })
          .chain((period) =>
            fc
              .array(candleArb, { minLength: 1, maxLength: period - 1 })
              .map((candles) => ({ candles, period })),
          ),
        ({ candles, period }) => {
          const out = sma(candles, period);
          for (const v of out) expect(v).toBeNull();
        },
      ),
    ));
});

// ---------------------------------------------------------------------------
// EMA
// ---------------------------------------------------------------------------

describe('ema (property)', () => {
  it('output length matches input length', () =>
    fc.assert(
      fc.property(fc.array(candleArb, { minLength: 1, maxLength: 200 }), (candles) => {
        const period = validPeriod(candles.length);
        expect(ema(candles, period)).toHaveLength(candles.length);
      }),
    ));

  it('seed matches SMA of first period values', () =>
    fc.assert(
      fc.property(
        fc
          .integer({ min: 2, max: 30 })
          .chain((period) =>
            fc
              .array(candleArb, {
                minLength: sufficientLength(period),
                maxLength: 100,
              })
              .map((candles) => ({ candles, period })),
          ),
        ({ candles, period }) => {
          const emaOut = ema(candles, period);
          const smaOut = sma(candles, period);
          const idx = period - 1;
          if (emaOut[idx] !== null && smaOut[idx] !== null) {
            expect(emaOut[idx]).toBe(smaOut[idx]);
          }
        },
      ),
    ));

  it('all-null when length < period', () =>
    fc.assert(
      fc.property(
        fc
          .integer({ min: 2, max: 50 })
          .chain((period) =>
            fc
              .array(candleArb, { minLength: 1, maxLength: period - 1 })
              .map((candles) => ({ candles, period })),
          ),
        ({ candles, period }) => {
          const out = ema(candles, period);
          for (const v of out) expect(v).toBeNull();
        },
      ),
    ));
});

// ---------------------------------------------------------------------------
// ATR
// ---------------------------------------------------------------------------

describe('atr (property)', () => {
  it('non-null values are always positive', () =>
    fc.assert(
      fc.property(
        fc
          .integer({ min: 2, max: 50 })
          .chain((period) =>
            fc
              .array(candleArb, { minLength: sufficientLength(period), maxLength: 200 })
              .map((candles) => ({ candles, period })),
          ),
        ({ candles, period }) => {
          const out = atr(candles, period);
          for (const v of out) {
            if (v !== null) expect(v).toBeGreaterThan(0);
          }
        },
      ),
    ));

  it('output length matches input length', () =>
    fc.assert(
      fc.property(fc.array(candleArb, { minLength: 1, maxLength: 200 }), (candles) => {
        expect(atr(candles)).toHaveLength(candles.length);
      }),
    ));
});

// ---------------------------------------------------------------------------
// MACD
// ---------------------------------------------------------------------------

describe('macd (property)', () => {
  it('hist = macd - signal for all non-null points', () =>
    fc.assert(
      fc.property(
        fc
          .integer({ min: 3, max: 20 })
          .chain((fast) =>
            fc
              .integer({ min: fast + 1, max: 40 })
              .chain((slow) =>
                fc
                  .integer({ min: 2, max: 15 })
                  .chain((signal) =>
                    fc
                      .array(candleArb, {
                        minLength: slow + signal + 10,
                        maxLength: 150,
                      })
                      .map((candles) => ({ candles, fast, slow, signal })),
                  ),
              ),
          ),
        ({ candles, fast, slow, signal }) => {
          const out = macd(candles, fast, slow, signal);
          let seenNonNull = false;
          for (const p of out) {
            if (p.macd !== null && p.signal !== null) {
              seenNonNull = true;
              expect(p.hist).toBeCloseTo(p.macd - p.signal, 10);
            }
          }
          expect(seenNonNull).toBe(true);
        },
      ),
    ));

  it('output length matches input length', () =>
    fc.assert(
      fc.property(fc.array(candleArb, { minLength: 1, maxLength: 100 }), (candles) => {
        expect(macd(candles, 5, 10, 3)).toHaveLength(candles.length);
      }),
    ));
});

// ---------------------------------------------------------------------------
// Pivots
// ---------------------------------------------------------------------------

const hlcArb = fc
  .tuple(priceArb, priceArb, priceArb)
  .filter(([h, l, _c]) => h >= l)
  .map(([h, l, c]) => ({ h, l, c }));

describe('classicPivots (property)', () => {
  it('matches the textbook formulas', () =>
    fc.assert(
      fc.property(hlcArb, ({ h, l, c }) => {
        const { pp, r1, r2, r3, s1, s2, s3 } = classicPivots(h, l, c);
        expect(pp).toBeCloseTo((h + l + c) / 3, 8);
        expect(r1).toBeCloseTo(2 * pp - l, 8);
        expect(s1).toBeCloseTo(2 * pp - h, 8);
        expect(r2).toBeCloseTo(pp + (h - l), 8);
        expect(s2).toBeCloseTo(pp - (h - l), 8);
        expect(r3).toBeCloseTo(h + 2 * (pp - l), 8);
        expect(s3).toBeCloseTo(l - 2 * (h - pp), 8);
      }),
    ));

  it('guaranteed ordering: r1 >= s1, r2 >= pp >= s2, r2 >= s2, r3 >= s3 (when h >= l)', () =>
    fc.assert(
      fc.property(hlcArb, ({ h, l, c }) => {
        const { pp, r1, r2, s1, s2, r3, s3 } = classicPivots(h, l, c);
        const eps = 1e-10;
        expect(r1 + eps).toBeGreaterThanOrEqual(s1);
        expect(r2 + eps).toBeGreaterThanOrEqual(pp);
        expect(pp + eps).toBeGreaterThanOrEqual(s2);
        expect(r2 + eps).toBeGreaterThanOrEqual(s2);
        expect(r3 + eps).toBeGreaterThanOrEqual(s3);
      }),
    ));
});

describe('pivotsAligned (property)', () => {
  it('first entry is null, remaining have valid structure', () =>
    fc.assert(
      fc.property(fc.array(candleArb, { minLength: 2, maxLength: 100 }), (candles) => {
        const out = pivotsAligned(candles);
        expect(out).toHaveLength(candles.length);
        expect(out[0]).toBeNull();
        for (let i = 1; i < out.length; i += 1) {
          const p = out[i];
          expect(p).not.toBeNull();
          const eps = 1e-8;
          expect(p!.r1).toBeCloseTo(2 * p!.pp - candles[i - 1]!.l, 8);
          expect(p!.s1).toBeCloseTo(2 * p!.pp - candles[i - 1]!.h, 8);
          expect(p!.r2 + eps).toBeGreaterThanOrEqual(p!.pp);
          expect(p!.pp + eps).toBeGreaterThanOrEqual(p!.s2);
        }
      }),
    ));
});

// ---------------------------------------------------------------------------
// Util functions
// ---------------------------------------------------------------------------

describe('util (property)', () => {
  it('closes returns all close prices', () =>
    fc.assert(
      fc.property(fc.array(candleArb, { minLength: 1, maxLength: 100 }), (candles) => {
        const cs = closes(candles);
        expect(cs).toHaveLength(candles.length);
        for (let i = 0; i < candles.length; i += 1) expect(cs[i]).toBe(candles[i]!.c);
      }),
    ));

  it('highs returns all high prices', () =>
    fc.assert(
      fc.property(fc.array(candleArb, { minLength: 1, maxLength: 100 }), (candles) => {
        const hs = highs(candles);
        expect(hs).toHaveLength(candles.length);
        for (let i = 0; i < candles.length; i += 1) expect(hs[i]).toBe(candles[i]!.h);
      }),
    ));

  it('lows returns all low prices', () =>
    fc.assert(
      fc.property(fc.array(candleArb, { minLength: 1, maxLength: 100 }), (candles) => {
        const ls = lows(candles);
        expect(ls).toHaveLength(candles.length);
        for (let i = 0; i < candles.length; i += 1) expect(ls[i]).toBe(candles[i]!.l);
      }),
    ));

  it('padFront prepends nullCount nulls', () =>
    fc.assert(
      fc.property(
        fc.array(fc.integer(), { minLength: 0, maxLength: 50 }),
        fc.integer({ min: 0, max: 20 }),
        (series, nullCount) => {
          const padded = padFront(series, nullCount);
          expect(padded).toHaveLength(series.length + nullCount);
          for (let i = 0; i < nullCount; i += 1) expect(padded[i]).toBeNull();
          for (let i = 0; i < series.length; i += 1) expect(padded[nullCount + i]).toBe(series[i]!);
        },
      ),
    ));

  it('mean is within [min, max] of its inputs', () =>
    fc.assert(
      fc.property(fc.array(fc.double({ min: -1e6, max: 1e6, noNaN: true }), { minLength: 1, maxLength: 100 }), (xs) => {
        const m = mean(xs);
        expect(Number.isNaN(m)).toBe(false);
        const lo = Math.min(...xs);
        const hi = Math.max(...xs);
        expect(m).toBeGreaterThanOrEqual(lo);
        expect(m).toBeLessThanOrEqual(hi);
      }),
    ));

  it('stdev is always non-negative', () =>
    fc.assert(
      fc.property(
        fc.array(fc.double({ min: -1e6, max: 1e6, noNaN: true }), { minLength: 2, maxLength: 100 }),
        (xs) => {
          const s = stdev(xs);
          expect(Number.isNaN(s)).toBe(false);
          expect(s).toBeGreaterThanOrEqual(0);
        },
      ),
    ));
});
