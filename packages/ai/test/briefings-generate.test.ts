import { describe, expect, it } from 'vitest';
import {
  buildEventPrompt,
  deterministicEventSummary,
  surpriseLabel,
  deterministicWeeklyReview,
  isoWeekKey,
  symbolFromCurrency,
} from '../src/briefings/generate';
import type { EconomicEvent } from '@hamafx/shared';

function makeEvent(overrides: Partial<EconomicEvent> = {}): EconomicEvent {
  return {
    id: 'evt-1',
    title: 'US Non-Farm Payrolls',
    country: 'US',
    currency: 'USD',
    importance: 'high',
    date: Date.UTC(2026, 6, 20, 12, 30, 0, 0),
    actual: null,
    forecast: 200,
    previous: 180,
    unit: 'K',
    source: 'BLS',
    ...overrides,
  };
}

describe('buildEventPrompt', () => {
  it('builds pre-event prompt', () => {
    const event = makeEvent();
    const prompt = buildEventPrompt(event, 'pre');
    expect(prompt).toContain('US Non-Farm Payrolls');
    expect(prompt).toContain('Country: US');
    expect(prompt).toContain('Currency: USD');
    expect(prompt).toContain('Importance: high');
    expect(prompt).toContain('Forecast: 200');
    expect(prompt).toContain('Previous: 180');
    expect(prompt).toContain('pre-event briefing');
    expect(prompt).not.toContain('Actual:');
  });

  it('builds post-event prompt with actual', () => {
    const event = makeEvent({ actual: 210 });
    const prompt = buildEventPrompt(event, 'post');
    expect(prompt).toContain('Actual: 210');
    expect(prompt).toContain('post-event recap');
  });

  it('handles null forecast and previous', () => {
    const event = makeEvent({ forecast: null, previous: null });
    const prompt = buildEventPrompt(event, 'pre');
    expect(prompt).toContain('Forecast: n/a');
    expect(prompt).toContain('Previous: n/a');
  });
});

describe('deterministicEventSummary', () => {
  it('produces pre-event summary with event details', () => {
    const event = makeEvent();
    const summary = deterministicEventSummary(event, 'pre');
    expect(summary).toContain('US Non-Farm Payrolls');
    expect(summary).toContain('USD');
    expect(summary).toContain('200');
    expect(summary).toContain('180');
    expect(summary).toContain('first 5 minutes');
  });

  it('produces post-event summary with actual', () => {
    const event = makeEvent({ actual: 210 });
    const summary = deterministicEventSummary(event, 'post');
    expect(summary).toContain('Actual: 210');
    expect(summary).toContain('Forecast: 200');
    expect(summary).toContain('Previous: 180');
  });

  it('falls back to country when currency is null', () => {
    const event = makeEvent({ currency: null });
    const summary = deterministicEventSummary(event, 'pre');
    expect(summary).toContain('US');
  });
});

describe('surpriseLabel', () => {
  it('returns "No surprise detectable" when actual is null', () => {
    expect(surpriseLabel(makeEvent({ actual: null }))).toBe('No surprise detectable.');
  });

  it('returns "No surprise detectable" when forecast is null', () => {
    expect(surpriseLabel(makeEvent({ forecast: null }))).toBe('No surprise detectable.');
  });

  it('returns "Print matched forecast" when equal', () => {
    expect(surpriseLabel(makeEvent({ actual: 200, forecast: 200 }))).toBe('Print matched forecast.');
  });

  it('returns "Beat (positive surprise)" when actual exceeds forecast', () => {
    expect(surpriseLabel(makeEvent({ actual: 250, forecast: 200 }))).toBe('Beat (positive surprise).');
  });

  it('returns "Miss (negative surprise)" when actual below forecast', () => {
    expect(surpriseLabel(makeEvent({ actual: 150, forecast: 200 }))).toBe('Miss (negative surprise).');
  });
});

describe('deterministicWeeklyReview', () => {
  function makeStats(overrides: Partial<{ count: number; wins: number; losses: number; breakevens: number; open: number; winRate: number; avgR: number; totalR: number }> = {}) {
    return {
      count: 10,
      wins: 6,
      losses: 3,
      breakevens: 0,
      open: 1,
      winRate: 0.667,
      avgR: 1.5,
      totalR: 9.0,
      ...overrides,
    };
  }

  it('produces weekly stats summary', () => {
    const stats = makeStats();
    const result = deterministicWeeklyReview(stats);
    expect(result).toContain('10 trades');
    expect(result).toContain('(6W / 3L / 0BE / 1 open)');
    expect(result).toContain('Win rate: 66.7%');
    expect(result).toContain('Avg R: 1.50');
    expect(result).toContain('Total R: 9.00');
  });

  it('uses singular for single trade', () => {
    const stats = makeStats({ count: 1, wins: 1, losses: 0, breakevens: 0, open: 0, winRate: 1.0 });
    const result = deterministicWeeklyReview(stats);
    expect(result).toContain('1 trade');
    expect(result).toContain('(1W / 0L / 0BE / 0 open)');
  });
});

describe('isoWeekKey', () => {
  it('returns ISO week key for a known date', () => {
    // July 20, 2026 is a Monday. ISO week: 2026-W30 (per ISO 8601 calendar)
    const d = new Date(Date.UTC(2026, 6, 20));
    const key = isoWeekKey(d);
    expect(key).toBe('2026-W30');
  });
});

describe('symbolFromCurrency', () => {
  it('maps EUR to EURUSD', () => {
    expect(symbolFromCurrency('EUR')).toBe('EURUSD');
  });

  it('maps GBP to GBPUSD', () => {
    expect(symbolFromCurrency('GBP')).toBe('GBPUSD');
  });

  it('maps everything else to XAUUSD', () => {
    expect(symbolFromCurrency('USD')).toBe('XAUUSD');
  });
});
