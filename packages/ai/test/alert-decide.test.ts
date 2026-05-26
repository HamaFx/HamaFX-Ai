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
