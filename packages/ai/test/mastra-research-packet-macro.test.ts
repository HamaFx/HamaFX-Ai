import { describe, expect, it } from 'vitest';

import {
  assembleXauusdMacroEvidence,
  type XauusdMacroFetchResult,
} from '../src/mastra/research-packet-macro';

const generatedAt = '2026-08-18T12:00:00.000Z';

function fulfilled<T>(value: T): PromiseFulfilledResult<T> {
  return { status: 'fulfilled', value };
}

function rejected(reason: unknown): PromiseRejectedResult {
  return { status: 'rejected', reason };
}

function fetchResult(overrides: Partial<XauusdMacroFetchResult> = {}): XauusdMacroFetchResult {
  return {
    news: fulfilled([
      {
        id: 'news-1',
        title: 'Gold rises as the dollar softens',
        summary: 'Fixture article',
        url: 'https://example.com/gold',
        source: 'fixture-news',
        publisher: 'Fixture',
        publishedAt: Date.parse('2026-08-18T11:00:00.000Z'),
        symbols: ['XAUUSD'],
        sentiment: 'positive',
        sentimentScore: 0.4,
        topics: [],
      },
    ]),
    events: fulfilled([
      {
        id: 'event-1',
        title: 'CPI',
        country: 'US',
        currency: 'USD',
        importance: 'high',
        date: Date.parse('2026-08-20T13:30:00.000Z'),
        actual: null,
        forecast: 3,
        previous: 2.9,
        unit: '%',
        source: 'fixture-calendar',
      },
    ]),
    dollarIndex: fulfilled([{ date: '2026-08-18', value: 101.2 }]),
    resonance: fulfilled({
      realYields: [{ date: '2026-08-18', value: 1.7 }],
      breakevenInflation: [{ date: '2026-08-18', value: 2.1 }],
    }),
    ...overrides,
  } as XauusdMacroFetchResult;
}

describe('XAUUSD macro evidence assembly', () => {
  it('preserves news, calendar, dollar, and yield context with bounded provenance', () => {
    const result = assembleXauusdMacroEvidence('packet-1', generatedAt, fetchResult());

    expect(result.missingData).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.evidence).toMatchObject({
      kind: 'macro',
      symbol: 'XAUUSD',
      quality: 'complete',
      dataAsOf: '2026-08-18T11:00:00.000Z',
      data: {
        news: [{ id: 'news-1' }],
        events: [{ id: 'event-1' }],
        dollarIndex: [{ value: 101.2 }],
        realYields: [{ value: 1.7 }],
        breakevenInflation: [{ value: 2.1 }],
      },
    });
  });

  it('keeps the packet usable when one macro provider is unavailable', () => {
    const result = assembleXauusdMacroEvidence(
      'packet-2',
      generatedAt,
      fetchResult({ resonance: rejected(new Error('FRED unavailable')) }),
    );

    expect(result.evidence?.quality).toBe('degraded');
    expect(result.missingData).toContain(
      'US real-yield and inflation-expectation data is unavailable.',
    );
    expect(result.warnings).toContain(
      'Macro context is partial because one or more providers were unavailable.',
    );
  });

  it('returns a typed gap instead of fabricating macro evidence when every source is empty', () => {
    const result = assembleXauusdMacroEvidence(
      'packet-3',
      generatedAt,
      fetchResult({
        news: fulfilled([]),
        events: fulfilled([]),
        dollarIndex: fulfilled([]),
        resonance: fulfilled({ realYields: [], breakevenInflation: [] }),
      }),
    );

    expect(result.evidence).toBeNull();
    expect(result.missingData).toContain('No macro evidence was returned by the configured providers.');
  });
});
