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

import {
  CandleSchema,
  TickSchema,
  NewsArticleSchema,
  EconomicEventSchema,
  IndicatorRequestSchema,
  IndicatorResultSchema,
  StructureResultSchema,
  ChatThreadSchema,
  ChatMessageSchema,
  AlertSchema,
  JournalEntrySchema,
  JournalStatsSchema,
  PortfolioPositionSchema,
  PortfolioSettingsSchema,
  PortfolioRiskReportSchema,
  CreatePositionInputSchema,
  ClosePositionInputSchema,
  SocialSentimentSchema,
  AggregatedSentimentSchema,
  NoiseConfigSchema,
  NoiseDecisionSchema,
  BriefingMessagePartSchema,
  UserPlanPartSchema,
} from '../src';

function validCandle(overrides?: Record<string, unknown>) {
  return {
    symbol: 'EURUSD',
    tf: '1h',
    t: 1748378101000,
    o: 1.1628,
    h: 1.1661,
    l: 1.1622,
    c: 1.1650,
    v: 0,
    source: 'twelve-data',
    fetchedAt: 1748378102000,
    ...overrides,
  };
}

function validTick(overrides?: Record<string, unknown>) {
  return {
    symbol: 'XAUUSD',
    bid: 2390.12,
    ask: 2390.32,
    mid: 2390.22,
    ts: 1748378101000,
    source: 'biquote-rest',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// CandleSchema
// ---------------------------------------------------------------------------
describe('CandleSchema', () => {
  it('accepts a valid candle', () => {
    expect(() => CandleSchema.parse(validCandle())).not.toThrow();
  });

  it('rejects non-integer timestamps', () => {
    expect(() => CandleSchema.parse(validCandle({ t: 1.5 }))).toThrow();
  });

  it('rejects missing required fields', () => {
    const { symbol: _, ...rest } = validCandle();
    expect(() => CandleSchema.parse(rest)).toThrow();
  });

  it('accepts null volume (FX case)', () => {
    const parsed = CandleSchema.parse(validCandle({ v: null }));
    expect(parsed.v).toBeNull();
  });

  it('rejects invalid timeframe', () => {
    expect(() => CandleSchema.parse(validCandle({ tf: 'invalid' }))).toThrow();
  });

  it('round-trips through JSON serialization', () => {
    const input = validCandle();
    const parsed = CandleSchema.parse(input);
    expect(JSON.parse(JSON.stringify(parsed))).toEqual(input);
  });
});

// ---------------------------------------------------------------------------
// TickSchema
// ---------------------------------------------------------------------------
describe('TickSchema', () => {
  it('accepts a valid tick', () => {
    expect(() => TickSchema.parse(validTick())).not.toThrow();
  });

  it('rejects missing symbol', () => {
    const { symbol: _, ...rest } = validTick();
    expect(() => TickSchema.parse(rest)).toThrow();
  });

  it('rejects non-integer timestamp', () => {
    expect(() => TickSchema.parse(validTick({ ts: 1.5 }))).toThrow();
  });

  it('round-trips through JSON', () => {
    const input = validTick();
    const parsed = TickSchema.parse(input);
    expect(JSON.parse(JSON.stringify(parsed))).toEqual(input);
  });
});

// ---------------------------------------------------------------------------
// NewsArticleSchema
// ---------------------------------------------------------------------------
describe('NewsArticleSchema', () => {
  const valid = {
    id: 'abc123',
    title: 'CPI Report Shows Inflation Cooling',
    summary: 'Core CPI came in at 3.2% vs 3.1% expected.',
    url: 'https://example.com/news/1',
    source: 'marketaux',
    publisher: 'Reuters',
    publishedAt: 1748378101000,
    symbols: ['EURUSD'],
    sentiment: 'positive' as const,
    sentimentScore: 0.45,
    topics: ['inflation', 'fed'],
  };

  it('accepts a valid article', () => {
    expect(() => NewsArticleSchema.parse(valid)).not.toThrow();
  });

  it('accepts nullable summary', () => {
    const parsed = NewsArticleSchema.parse({ ...valid, summary: null });
    expect(parsed.summary).toBeNull();
  });

  it('accepts nullable sentiment', () => {
    const parsed = NewsArticleSchema.parse({ ...valid, sentiment: null, sentimentScore: null });
    expect(parsed.sentiment).toBeNull();
  });

  it('defaults topics to empty array', () => {
    const { topics: _, ...rest } = valid;
    const parsed = NewsArticleSchema.parse(rest);
    expect(parsed.topics).toEqual([]);
  });

  it('rejects invalid sentiment', () => {
    expect(() => NewsArticleSchema.parse({ ...valid, sentiment: 'super_bullish' })).toThrow();
  });

  it('rejects out-of-range sentimentScore', () => {
    expect(() => NewsArticleSchema.parse({ ...valid, sentimentScore: 1.5 })).toThrow();
    expect(() => NewsArticleSchema.parse({ ...valid, sentimentScore: -2 })).toThrow();
  });

  it('rejects non-url in url field', () => {
    expect(() => NewsArticleSchema.parse({ ...valid, url: 'not-a-url' })).toThrow();
  });
});

// ---------------------------------------------------------------------------
// EconomicEventSchema
// ---------------------------------------------------------------------------
describe('EconomicEventSchema', () => {
  const valid = {
    id: 'event-1',
    title: 'CPI YoY',
    country: 'US',
    currency: 'USD',
    importance: 'high' as const,
    date: 1748378101000,
    actual: 3.2,
    forecast: 3.1,
    previous: 3.0,
    unit: '%',
    source: 'trading-economics',
  };

  it('accepts a valid event', () => {
    expect(() => EconomicEventSchema.parse(valid)).not.toThrow();
  });

  it('accepts nullable numeric fields', () => {
    const parsed = EconomicEventSchema.parse({
      ...valid,
      actual: null,
      forecast: null,
      previous: null,
    });
    expect(parsed.actual).toBeNull();
    expect(parsed.forecast).toBeNull();
    expect(parsed.previous).toBeNull();
  });

  it('accepts non-enum country as free string', () => {
    const parsed = EconomicEventSchema.parse({ ...valid, country: 'JP' });
    expect(parsed.country).toBe('JP');
  });

  it('rejects invalid importance', () => {
    expect(() => EconomicEventSchema.parse({ ...valid, importance: 'critical' })).toThrow();
  });

  it('rejects non-integer date', () => {
    expect(() => EconomicEventSchema.parse({ ...valid, date: 1.5 })).toThrow();
  });
});

// ---------------------------------------------------------------------------
// IndicatorRequestSchema / IndicatorResultSchema
// ---------------------------------------------------------------------------
describe('IndicatorRequestSchema', () => {
  it('accepts a valid request', () => {
    const parsed = IndicatorRequestSchema.parse({ kind: 'rsi', params: { period: 14 } });
    expect(parsed.kind).toBe('rsi');
    expect(parsed.params).toEqual({ period: 14 });
  });

  it('defaults params to empty object', () => {
    const parsed = IndicatorRequestSchema.parse({ kind: 'sma' });
    expect(parsed.params).toEqual({});
  });

  it('rejects unknown indicator kind', () => {
    expect(() => IndicatorRequestSchema.parse({ kind: 'unknown' })).toThrow();
  });
});

describe('IndicatorResultSchema', () => {
  const valid = {
    symbol: 'EURUSD',
    tf: '1h',
    kind: 'rsi',
    params: { period: 14 },
    values: [45.2, 48.1, 52.3, null],
    fetchedAt: 1748378101000,
  };

  it('accepts a valid result', () => {
    expect(() => IndicatorResultSchema.parse(valid)).not.toThrow();
  });

  it('accepts record-type values (sub-series)', () => {
    const parsed = IndicatorResultSchema.parse({
      ...valid,
      values: [{ sma: 1.1, ema: 1.2 }, null],
    });
    expect(parsed.values[0]).toEqual({ sma: 1.1, ema: 1.2 });
  });

  it('rejects non-integer fetchedAt', () => {
    expect(() => IndicatorResultSchema.parse({ ...valid, fetchedAt: 1.5 })).toThrow();
  });
});

// ---------------------------------------------------------------------------
// StructureResultSchema
// ---------------------------------------------------------------------------
describe('StructureResultSchema', () => {
  const valid = {
    symbol: 'XAUUSD',
    tf: '1h',
    bars: 100,
    swings: [
      { index: 5, time: 1748378101000, price: 2390.5, type: 'high', lookback: 3 },
      { index: 10, time: 1748378102000, price: 2385.0, type: 'low', lookback: 3 },
    ],
    events: [
      {
        kind: 'bos',
        direction: 'bullish',
        brokenAt: 12,
        time: 1748378103000,
        level: 2390.5,
        swingIndex: 0,
      },
    ],
    fvg: [
      {
        side: 'bullish',
        startIndex: 8,
        endIndex: 10,
        startTime: 1748378101000,
        endTime: 1748378103000,
        top: 2391.0,
        bottom: 2388.5,
        mitigated: false,
      },
    ],
    orderBlocks: [
      {
        side: 'bullish',
        index: 7,
        time: 1748378102000,
        top: 2389.0,
        bottom: 2387.5,
        mitigated: false,
      },
    ],
    liquidity: [
      {
        side: 'high',
        index: 15,
        time: 1748378104000,
        level: 2395.0,
        wick: 2396.2,
      },
    ],
    fetchedAt: 1748378105000,
  };

  it('accepts a full result', () => {
    expect(() => StructureResultSchema.parse(valid)).not.toThrow();
  });

  it('accepts minimal result with only required fields', () => {
    const parsed = StructureResultSchema.parse({
      symbol: 'EURUSD',
      tf: '1h',
      bars: 50,
      fetchedAt: 1748378101000,
    });
    expect(parsed.swings).toBeUndefined();
    expect(parsed.events).toBeUndefined();
    expect(parsed.fvg).toBeUndefined();
  });

  it('rejects negative bars', () => {
    expect(() =>
      StructureResultSchema.parse({ symbol: 'EURUSD', tf: '1h', bars: -1, fetchedAt: 1 }),
    ).toThrow();
  });

  it('rejects invalid swing type', () => {
    expect(() => StructureResultSchema.parse({ ...valid, swings: [{ ...valid.swings![0], type: 'mid' }] })).toThrow();
  });

  it('rejects invalid structure event kind', () => {
    expect(() => StructureResultSchema.parse({ ...valid, events: [{ ...valid.events![0], kind: 'invalid' }] })).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Chat schemas
// ---------------------------------------------------------------------------
describe('ChatThreadSchema', () => {
  const valid = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    title: 'Morning Analysis',
    titleSource: 'llm',
    pinnedSymbol: 'XAUUSD',
    modelOverride: null,
    createdAt: 1748378101000,
    updatedAt: 1748378102000,
  };

  it('accepts a valid thread', () => {
    expect(() => ChatThreadSchema.parse(valid)).not.toThrow();
  });

  it('accepts null title and nullable titleSource', () => {
    const parsed = ChatThreadSchema.parse({ ...valid, title: null, titleSource: null });
    expect(parsed.title).toBeNull();
    expect(parsed.titleSource).toBeNull();
  });

  it('rejects non-uuid id', () => {
    expect(() => ChatThreadSchema.parse({ ...valid, id: 'not-uuid' })).toThrow();
  });

  it('rejects invalid titleSource', () => {
    expect(() => ChatThreadSchema.parse({ ...valid, titleSource: 'invalid' })).toThrow();
  });
});

describe('ChatMessageSchema', () => {
  const valid = {
    id: '550e8400-e29b-41d4-a716-446655440001',
    threadId: '550e8400-e29b-41d4-a716-446655440000',
    role: 'user' as const,
    content: 'What is the price of gold?',
    parts: null,
    createdAt: 1748378101000,
  };

  it('accepts a valid message', () => {
    expect(() => ChatMessageSchema.parse(valid)).not.toThrow();
  });

  it('accepts all chat roles', () => {
    for (const role of ['user', 'assistant', 'system', 'tool'] as const) {
      expect(() => ChatMessageSchema.parse({ ...valid, role })).not.toThrow();
    }
  });

  it('rejects invalid role', () => {
    expect(() => ChatMessageSchema.parse({ ...valid, role: 'invalid' })).toThrow();
  });

  it('accepts unknown parts payload (JSON blob)', () => {
    const parsed = ChatMessageSchema.parse({ ...valid, parts: { toolCallId: '123' } });
    expect(parsed.parts).toEqual({ toolCallId: '123' });
  });
});

// ---------------------------------------------------------------------------
// AlertSchema
// ---------------------------------------------------------------------------
describe('AlertSchema', () => {
  const valid = {
    id: '550e8400-e29b-41d4-a716-446655440002',
    userId: 'user-1',
    rule: {
      type: 'priceCross' as const,
      symbol: 'XAUUSD',
      level: 2400,
      direction: 'above' as const,
    },
    channels: ['email', 'telegram'] as const,
    note: 'Alert when gold breaks 2400',
    active: true,
    firedAt: null,
    createdAt: 1748378101000,
  };

  it('accepts a valid alert', () => {
    expect(() => AlertSchema.parse(valid)).not.toThrow();
  });

  it('accepts a candleClose rule', () => {
    const rule = {
      type: 'candleClose' as const,
      symbol: 'EURUSD',
      tf: '1h' as const,
      level: 1.15,
      direction: 'below' as const,
    };
    expect(() => AlertSchema.parse({ ...valid, rule })).not.toThrow();
  });

  it('accepts an indicatorCross rule with optional previousValue', () => {
    const rule = {
      type: 'indicatorCross' as const,
      symbol: 'XAUUSD',
      tf: '1h' as const,
      indicator: 'rsi:14',
      level: 30,
      direction: 'above' as const,
    };
    const parsed = AlertSchema.parse({ ...valid, rule });
    expect(parsed.rule.type).toBe('indicatorCross');
  });

  it('defaults channels to ["email"]', () => {
    const { channels: _, ...rest } = valid;
    const parsed = AlertSchema.parse(rest);
    expect(parsed.channels).toEqual(['email']);
  });

  it('defaults snoozeHours to 0', () => {
    const parsed = AlertSchema.parse(valid);
    expect(parsed.snoozeHours).toBe(0);
  });

  it('rejects invalid indicator spec format', () => {
    expect(() =>
      AlertSchema.parse({
        ...valid,
        rule: {
          type: 'indicatorCross',
          symbol: 'XAUUSD',
          tf: '1h',
          indicator: 'rsi:bogus',
          level: 30,
          direction: 'above',
        },
      }),
    ).toThrow();
  });

  it('rejects out-of-range snoozeHours', () => {
    expect(() =>
      AlertSchema.parse({
        ...valid,
        snoozeHours: 200,
      }),
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// JournalEntrySchema
// ---------------------------------------------------------------------------
describe('JournalEntrySchema', () => {
  const valid = {
    id: '550e8400-e29b-41d4-a716-446655440003',
    symbol: 'XAUUSD',
    side: 'long' as const,
    openedAt: 1748378101000,
    closedAt: 1748378200000,
    entry: 2390.5,
    stop: 2385.0,
    target: 2410.0,
    exit: 2405.0,
    size: 1.0,
    outcome: 'win' as const,
    rMultiple: 2.5,
    notes: 'Great trade',
    tags: ['breakout', 'momentum'],
    attachments: [],
    createdAt: 1748378101000,
    updatedAt: 1748378200000,
  };

  it('accepts a valid entry', () => {
    expect(() => JournalEntrySchema.parse(valid)).not.toThrow();
  });

  it('accepts nullable fields', () => {
    const parsed = JournalEntrySchema.parse({
      ...valid,
      closedAt: null,
      stop: null,
      target: null,
      exit: null,
      size: null,
      rMultiple: null,
      notes: null,
    });
    expect(parsed.closedAt).toBeNull();
    expect(parsed.size).toBeNull();
  });

  it('defaults tags to empty array', () => {
    const { tags: _, ...rest } = valid;
    const parsed = JournalEntrySchema.parse(rest);
    expect(parsed.tags).toEqual([]);
  });

  it('accepts all trade outcomes', () => {
    for (const outcome of ['win', 'loss', 'breakeven', 'open'] as const) {
      expect(() => JournalEntrySchema.parse({ ...valid, outcome })).not.toThrow();
    }
  });

  it('rejects invalid side', () => {
    expect(() => JournalEntrySchema.parse({ ...valid, side: 'invalid' })).toThrow();
  });
});

describe('JournalStatsSchema', () => {
  const valid = {
    count: 50,
    wins: 30,
    losses: 15,
    breakevens: 5,
    open: 0,
    winRate: 0.6,
    avgR: 1.8,
    totalR: 90,
  };

  it('accepts minimal stats', () => {
    expect(() => JournalStatsSchema.parse(valid)).not.toThrow();
  });

  it('accepts extended metrics', () => {
    const parsed = JournalStatsSchema.parse({
      ...valid,
      maxDrawdown: -500,
      longestWinStreak: 8,
      longestLossStreak: 3,
      profitFactor: 2.1,
      avgHoldMs: 3600000,
      perDayOfWeek: { sunday: 0, monday: 5, tuesday: 3, wednesday: 4, thursday: 2, friday: 1, saturday: 0 },
    });
    expect(parsed.maxDrawdown).toBe(-500);
    expect(parsed.longestWinStreak).toBe(8);
    expect(parsed.perDayOfWeek!.monday).toBe(5);
  });

  it('rejects winRate out of range', () => {
    expect(() => JournalStatsSchema.parse({ ...valid, winRate: 1.5 })).toThrow();
    expect(() => JournalStatsSchema.parse({ ...valid, winRate: -0.1 })).toThrow();
  });
});

// ---------------------------------------------------------------------------
// PortfolioPositionSchema
// ---------------------------------------------------------------------------
describe('PortfolioPositionSchema', () => {
  const valid = {
    id: '550e8400-e29b-41d4-a716-446655440008',
    userId: 'user-1',
    symbol: 'XAUUSD',
    direction: 'long' as const,
    lotSize: 1.0,
    entryPrice: 2390.0,
    stopLoss: 2380.0,
    takeProfit: 2420.0,
    openedAt: 1748378101000,
    closedAt: null,
    closePrice: null,
    status: 'open' as const,
    notes: 'Position opened on breakout',
    linkedSignalId: null,
    createdAt: 1748378101000,
    updatedAt: 1748378101000,
  };

  it('accepts a valid position', () => {
    expect(() => PortfolioPositionSchema.parse(valid)).not.toThrow();
  });

  it('accepts closed position with values', () => {
    const parsed = PortfolioPositionSchema.parse({
      ...valid,
      status: 'closed',
      closedAt: 1748378200000,
      closePrice: 2410.0,
    });
    expect(parsed.status).toBe('closed');
    expect(parsed.closePrice).toBe(2410.0);
  });

  it('rejects negative lotSize', () => {
    expect(() => PortfolioPositionSchema.parse({ ...valid, lotSize: -1 })).toThrow();
  });

  it('rejects non-positive entryPrice', () => {
    expect(() => PortfolioPositionSchema.parse({ ...valid, entryPrice: 0 })).toThrow();
  });
});

// ---------------------------------------------------------------------------
// PortfolioSettingsSchema
// ---------------------------------------------------------------------------
describe('PortfolioSettingsSchema', () => {
  it('accepts with defaults', () => {
    const parsed = PortfolioSettingsSchema.parse({
      userId: 'user-1',
      accountBalance: 10000,
      baseCurrency: 'USD',
      updatedAt: 1748378101000,
    });
    expect(parsed.maxRiskPerTradePct).toBe(2.0);
    expect(parsed.maxTotalExposurePct).toBe(10.0);
  });

  it('rejects out-of-range risk percentages', () => {
    expect(() =>
      PortfolioSettingsSchema.parse({
        userId: 'user-1',
        accountBalance: null,
        updatedAt: 1,
        maxRiskPerTradePct: 101,
      }),
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// PortfolioRiskReportSchema
// ---------------------------------------------------------------------------
describe('PortfolioRiskReportSchema', () => {
  const valid = {
    totalExposureUsd: 50000,
    totalExposurePct: 50.0,
    totalRiskUsd: 2500,
    totalRiskPct: 2.5,
    concentration: [{ symbol: 'XAUUSD', pct: 80, alert: true }],
    correlationRisk: [{ pair: 'XAUUSD/EURUSD', correlation: 0.3, alert: false }],
    positionsNearStop: [{ symbol: 'XAUUSD', direction: 'long', distancePct: 0.5 }],
    alerts: [{ level: 'warning', message: 'High concentration in XAUUSD' }],
    openPositionCount: 3,
  };

  it('accepts a valid risk report', () => {
    expect(() => PortfolioRiskReportSchema.parse(valid)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// CreatePositionInputSchema / ClosePositionInputSchema
// ---------------------------------------------------------------------------
describe('CreatePositionInputSchema', () => {
  it('accepts valid input', () => {
    const parsed = CreatePositionInputSchema.parse({
      symbol: 'EURUSD',
      direction: 'long',
      lotSize: 1.5,
      entryPrice: 1.1650,
    });
    expect(parsed.symbol).toBe('EURUSD');
  });

  it('accepts optional fields', () => {
    const parsed = CreatePositionInputSchema.parse({
      symbol: 'XAUUSD',
      direction: 'short',
      lotSize: 0.5,
      entryPrice: 2400.0,
      stopLoss: null,
      takeProfit: null,
      notes: null,
      linkedSignalId: null,
    });
    expect(parsed.stopLoss).toBeNull();
    expect(parsed.notes).toBeNull();
  });
});

describe('ClosePositionInputSchema', () => {
  it('accepts valid close input', () => {
    expect(() => ClosePositionInputSchema.parse({ closePrice: 2410.0 })).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// SocialSentimentSchema
// ---------------------------------------------------------------------------
describe('SocialSentimentSchema', () => {
  const valid = {
    symbol: 'XAUUSD',
    source: 'reddit' as const,
    sentiment: 'bullish' as const,
    score: 0.3,
    retailLongPct: 65,
    sampleSize: 1000,
    fetchedAt: 1748378101000,
    available: true,
  };

  it('accepts valid sentiment', () => {
    expect(() => SocialSentimentSchema.parse(valid)).not.toThrow();
  });

  it('accepts nullable retailLongPct', () => {
    const parsed = SocialSentimentSchema.parse({ ...valid, retailLongPct: null });
    expect(parsed.retailLongPct).toBeNull();
  });

  it('rejects score out of range', () => {
    expect(() => SocialSentimentSchema.parse({ ...valid, score: 1.5 })).toThrow();
  });

  it('rejects retailLongPct out of range', () => {
    expect(() => SocialSentimentSchema.parse({ ...valid, retailLongPct: 101 })).toThrow();
  });

  it('rejects invalid source', () => {
    expect(() => SocialSentimentSchema.parse({ ...valid, source: 'unknown' })).toThrow();
  });
});

// ---------------------------------------------------------------------------
// AggregatedSentimentSchema
// ---------------------------------------------------------------------------
describe('AggregatedSentimentSchema', () => {
  const valid = {
    symbol: 'XAUUSD',
    overall: 'neutral' as const,
    overallScore: 0.1,
    sources: [
      {
        symbol: 'XAUUSD',
        source: 'reddit' as const,
        sentiment: 'bullish' as const,
        score: 0.3,
        retailLongPct: null,
        sampleSize: 500,
        fetchedAt: 1748378101000,
        available: true,
      },
    ],
    contrarianSignal: false,
    contrarianNote: null,
    fetchedAt: 1748378101000,
  };

  it('accepts valid aggregated sentiment', () => {
    expect(() => AggregatedSentimentSchema.parse(valid)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// NoiseConfigSchema / NoiseDecisionSchema
// ---------------------------------------------------------------------------
describe('NoiseConfigSchema', () => {
  it('accepts minimal config with defaults', () => {
    const parsed = NoiseConfigSchema.parse({});
    expect(parsed.dedupTtlSeconds).toBe(300);
    expect(parsed.cooldownSeconds).toBe(60);
    expect(parsed.quietHours).toBeNull();
    expect(parsed.timezone).toBe('UTC');
    expect(parsed.minSeverity).toBe('info');
    expect(parsed.dailyDigestMode).toBe(false);
  });

  it('accepts quiet hours in valid HH:MM format', () => {
    const parsed = NoiseConfigSchema.parse({
      quietHours: { start: '22:00', end: '07:00' },
    });
    expect(parsed.quietHours!.start).toBe('22:00');
  });

  it('rejects quiet hours with invalid format', () => {
    expect(() =>
      NoiseConfigSchema.parse({ quietHours: { start: '10pm', end: '7am' } }),
    ).toThrow();
  });

  it('rejects dedupTtlSeconds over max', () => {
    expect(() => NoiseConfigSchema.parse({ dedupTtlSeconds: 100000 })).toThrow();
  });
});

describe('NoiseDecisionSchema', () => {
  it('accepts a valid allowed decision', () => {
    const parsed = NoiseDecisionSchema.parse({
      shouldSend: true,
      reasonCode: 'allowed',
      message: 'Notification delivered',
      dedupKey: null,
      cooldownKey: null,
    });
    expect(parsed.shouldSend).toBe(true);
  });

  it('accepts a blocked decision with reason', () => {
    const parsed = NoiseDecisionSchema.parse({
      shouldSend: false,
      reasonCode: 'cooldown',
      message: 'In cooldown period (45s remaining)',
      dedupKey: null,
      cooldownKey: 'alert:priceCross:XAUUSD:2400',
    });
    expect(parsed.shouldSend).toBe(false);
    expect(parsed.cooldownKey).toBe('alert:priceCross:XAUUSD:2400');
  });
});

// ---------------------------------------------------------------------------
// BriefingMessagePartSchema
// ---------------------------------------------------------------------------
describe('BriefingMessagePartSchema', () => {
  it('accepts a pre-briefing part', () => {
    const parsed = BriefingMessagePartSchema.parse({
      type: 'briefing',
      eventId: 'event-1',
      kind: 'pre',
      summary: 'CPI release in 30 minutes',
    });
    expect(parsed.kind).toBe('pre');
  });

  it('accepts a weekly review', () => {
    const parsed = BriefingMessagePartSchema.parse({
      type: 'briefing',
      eventId: null,
      kind: 'weekly_review',
      summary: 'Weekly market review',
    });
    expect(parsed.kind).toBe('weekly_review');
  });

  it('rejects invalid kind', () => {
    expect(() =>
      BriefingMessagePartSchema.parse({
        type: 'briefing',
        eventId: null,
        kind: 'invalid',
        summary: 'x',
      }),
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// UserPlanPartSchema
// ---------------------------------------------------------------------------
describe('UserPlanPartSchema', () => {
  const valid = {
    type: 'data-plan' as const,
    domain: 'technical' as const,
    steps: ['Analyze price action', 'Check indicators'],
    expectedTools: ['get_candles', 'get_indicators'],
    rationale: 'User asked about technical setup',
    modelId: 'gpt-4',
    createdAt: 1748378101000,
  };

  it('accepts a valid plan part', () => {
    expect(() => UserPlanPartSchema.parse(valid)).not.toThrow();
  });

  it('rejects too many steps (max 8)', () => {
    expect(() =>
      UserPlanPartSchema.parse({ ...valid, steps: Array.from({ length: 9 }, (_, i) => `Step ${i}`) }),
    ).toThrow();
  });
});
