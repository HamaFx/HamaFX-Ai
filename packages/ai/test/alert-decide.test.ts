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

// Pure-logic tests for the alert evaluator's decision and rule description.
// We don't unit-test the orchestrator here — it hits the DB / providers and
// is better covered with an integration test (post-deploy smoke).

import { describe, expect, it } from 'vitest';

import { decideMatch, describeRule } from '../src/alerts/evaluator';

describe('decideMatch', () => {
  it('above: fires at-or-above level', () => {
    expect(decideMatch('above', 100, 100)).toBe(true);
    expect(decideMatch('above', 101, 100)).toBe(true);
    expect(decideMatch('above', 99.999, 100)).toBe(false);
  });
  it('below: fires at-or-below level', () => {
    expect(decideMatch('below', 100, 100)).toBe(true);
    expect(decideMatch('below', 99, 100)).toBe(true);
    expect(decideMatch('below', 100.001, 100)).toBe(false);
  });
});

describe('describeRule', () => {
  it('formats price-cross rule', () => {
    expect(
      describeRule({ type: 'priceCross', symbol: 'XAUUSD', level: 2400, direction: 'above' }),
    ).toBe('XAUUSD price above 2400');
  });
  it('formats candle-close rule', () => {
    expect(
      describeRule({
        type: 'candleClose',
        symbol: 'EURUSD',
        tf: '1h',
        level: 1.085,
        direction: 'below',
      }),
    ).toBe('EURUSD 1h close below 1.085');
  });
  it('formats indicator-cross rule', () => {
    expect(
      describeRule({
        type: 'indicatorCross',
        symbol: 'GBPUSD',
        tf: '15m',
        indicator: 'rsi:14',
        level: 70,
        direction: 'above',
      }),
    ).toBe('GBPUSD 15m rsi:14 above 70');
  });
});
