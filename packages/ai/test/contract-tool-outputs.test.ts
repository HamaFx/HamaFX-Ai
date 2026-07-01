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

// Phase 4.3: Contract tests — verify that tool output schemas in
// @hamafx/shared correctly validate the data produced by tool execute().
// Every tool registered in packages/ai/src/tools/ has a corresponding
// xxxOutputSchema in packages/shared/src/schemas/tool-outputs/. This file
// imports each schema and asserts that valid outputs pass and invalid
// inputs are rejected. Sample data mirrors what the tools actually return.

import { describe, expect, it } from 'vitest';

import {
  AnalyzeChartImageOutputSchema,
  AnalyzeFundamentalOutputSchema,
  AnalyzeTechnicalOutputSchema,
  AnnotateChartOutputSchema,
  ComputePositionHealthOutputSchema,
  ComputeRiskOutputSchema,
  ConveneCommitteeOutputSchema,
  ForecastVolatilityOutputSchema,
  GetCalendarOutputSchema,
  GetCandlesOutputSchema,
  GetCorrelationOutputSchema,
  GetCoTOutputSchema,
  GetIndicatorsOutputSchema,
  GetIntermarketOutputSchema,
  GetIntermarketResonanceOutputSchema,
  GetJournalStatsOutputSchema,
  GetMarketStructureOutputSchema,
  GetNewsOutputSchema,
  GetPortfolioSnapshotOutputSchema,
  GetPriceOutputSchema,
  GetSeasonalityOutputSchema,
  GetSessionLevelsOutputSchema,
  GetSocialSentimentOutputSchema,
  GetSystemDiagnosticsOutputSchema,
  LogJournalOutputSchema,
  ReplaySetupOutputSchema,
  RunSystemActionOutputSchema,
  SearchKnowledgeOutputSchema,
  SetAlertOutputSchema,
  ShareSnapshotOutputSchema,
  SummarizeThreadOutputSchema,
  VerifyCallOutputSchema,
} from '@hamafx/shared';

describe('GetPriceOutputSchema', () => {
  it('validates a standard response', () => {
    const result = GetPriceOutputSchema.safeParse({
      ticks: [
        { symbol: 'EURUSD', bid: 1.08, ask: 1.0802, mid: 1.0801, ts: Date.now(), source: 'twelve-data' },
      ],
      asOf: new Date().toISOString(),
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing asOf', () => {
    const result = GetPriceOutputSchema.safeParse({ ticks: [] });
    expect(result.success).toBe(false);
  });

  it('rejects non-array ticks', () => {
    const result = GetPriceOutputSchema.safeParse({ ticks: 'bad', asOf: '2026-01-01T00:00:00.000Z' });
    expect(result.success).toBe(false);
  });
});

describe('ComputeRiskOutputSchema', () => {
  const valid = {
    symbol: 'EURUSD',
    side: 'long',
    entry: 1.085,
    stop: 1.082,
    target: 1.092,
    riskUsd: 100,
    rewardUsd: 233.33,
    rrRatio: 2.33,
    pipsToStop: 30,
    pipsToTarget: 70,
    pipValueUsdPerLot: 10,
    positionSizeLots: 0.3333,
    positionSizeUnits: 33333,
    invalidDirection: false,
    summary: 'Long EURUSD: 0.33 lots, $100.00 at risk over 30.0p stop, RR 2.33 ($233.33 reward).',
  };

  it('validates a standard output', () => {
    expect(ComputeRiskOutputSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects invalid side', () => {
    expect(ComputeRiskOutputSchema.safeParse({ ...valid, side: 'diagonal' }).success).toBe(false);
  });

  it('accepts nullable target fields', () => {
    expect(
      ComputeRiskOutputSchema.safeParse({
        ...valid,
        target: null,
        rewardUsd: null,
        rrRatio: null,
        pipsToTarget: null,
      }).success,
    ).toBe(true);
  });
});

describe('AnalyzeTechnicalOutputSchema', () => {
  const reading = (tf: string) => ({
    tf,
    trend: 'up',
    bias: 'bullish',
    momentum: { rsi14: 62, macdHist: 0.00012 },
    structure: { swingHigh: 1.095, swingLow: 1.078, latestStructureEvent: 'BOS_up' },
    levels: { pivot: 1.085, r1: 1.092, s1: 1.078, atr14: 0.005 },
  });

  const valid = {
    symbol: 'EURUSD',
    asOf: Date.now(),
    perTimeframe: [reading('4h'), reading('1h'), reading('15m')],
    summary: 'EURUSD: 4h=up/bullish · 1h=up/bullish · 15m=range/neutral.',
    partial: false,
  };

  it('validates a standard output', () => {
    expect(AnalyzeTechnicalOutputSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects missing summary', () => {
    const { summary: _, ...rest } = valid;
    expect(AnalyzeTechnicalOutputSchema.safeParse(rest).success).toBe(false);
  });

  it('accepts partial: true with fewer timeframes', () => {
    expect(
      AnalyzeTechnicalOutputSchema.safeParse({
        ...valid,
        perTimeframe: [reading('4h')],
        partial: true,
        summary: 'EURUSD: 4h=up/bullish. (partial).',
      }).success,
    ).toBe(true);
  });

  it('rejects invalid trend value', () => {
    expect(
      AnalyzeTechnicalOutputSchema.safeParse({
        ...valid,
        perTimeframe: [{ ...reading('4h'), trend: 'diagonal' }],
      }).success,
    ).toBe(false);
  });
});

describe('GetCandlesOutputSchema', () => {
  it('validates with a candle array', () => {
    expect(
      GetCandlesOutputSchema.safeParse({
        symbol: 'EURUSD',
        tf: '1h',
        candles: [
          {
            symbol: 'EURUSD', tf: '1h', t: Date.now(),
            o: 1.08, h: 1.081, l: 1.079, c: 1.0805, v: 1234,
            source: 'twelve-data', fetchedAt: Date.now(),
          },
        ],
      }).success,
    ).toBe(true);
  });
});

describe('GetNewsOutputSchema', () => {
  it('validates with articles', () => {
    expect(
      GetNewsOutputSchema.safeParse({
        items: [
          {
            id: 'abc123', title: 'USD strengthens', summary: 'Dollar rose.',
            url: 'https://example.com', source: 'marketaux', publisher: 'Reuters',
            publishedAt: Date.now(), sentiment: 'positive', sentimentScore: 0.75,
          },
        ],
        pipelinePending: false,
      }).success,
    ).toBe(true);
  });

  it('accepts nullable sentiment fields', () => {
    expect(
      GetNewsOutputSchema.safeParse({
        items: [{ id: 'abc456', title: 'Markets calm', summary: null,
          url: 'https://example.com', source: 'marketaux', publisher: null,
          publishedAt: Date.now(), sentiment: null, sentimentScore: null }],
        pipelinePending: false,
      }).success,
    ).toBe(true);
  });
});

describe('GetCalendarOutputSchema', () => {
  it('validates calendar events', () => {
    expect(
      GetCalendarOutputSchema.safeParse({
        items: [{ id: '1', title: 'NFP', country: 'US', currency: 'USD',
          importance: 'high', date: Date.now(), actual: null, forecast: null,
          previous: null, unit: null, source: 'fred' }],
        pipelinePending: false,
      }).success,
    ).toBe(true);
  });
});

describe('GetSystemDiagnosticsOutputSchema', () => {
  it('validates healthy output', () => {
    expect(
      GetSystemDiagnosticsOutputSchema.safeParse({
        status: 'healthy',
        asOf: new Date().toISOString(),
        database: { status: 'connected', latencyMs: 42, journalEntriesCount: 150,
          snapshotsCount: 89, briefingsCount: 12, resonanceCount: 34, memoryEmbeddingsCount: 67 },
        worker: { resonanceSyncLastRun: '2026-06-27T12:00:00Z', cotSyncLastRun: null, activeAlertsCount: 3 },
        budget: { spentUsd: 0.45, limitUsd: 10.0, remainingUsd: 9.55 },
        envCheck: { FRED_API_KEY: true, GOOGLE_VERTEX_PROJECT: true },
        narrative: 'System status is HEALTHY.',
      }).success,
    ).toBe(true);
  });

  it('rejects invalid status', () => {
    expect(
      GetSystemDiagnosticsOutputSchema.safeParse({
        status: 'unknown', asOf: '2026-01-01T00:00:00.000Z',
        database: { status: 'connected', latencyMs: 0, journalEntriesCount: 0, snapshotsCount: 0, briefingsCount: 0, resonanceCount: 0, memoryEmbeddingsCount: 0 },
        worker: { resonanceSyncLastRun: null, cotSyncLastRun: null, activeAlertsCount: 0 },
        budget: { spentUsd: 0, limitUsd: 10, remainingUsd: 10 },
        envCheck: {}, narrative: '',
      }).success,
    ).toBe(false);
  });
});

describe('GetSessionLevelsOutputSchema', () => {
  const s = (tag: string) => ({
    session: tag, fromMs: 1_700_000_000_000, toMs: 1_700_025_200_000,
    open: 1.0800, high: 1.0820, low: 1.0790, close: 1.0810, forming: false,
  });

  it('validates standard output', () => {
    expect(
      GetSessionLevelsOutputSchema.safeParse({
        symbol: 'EURUSD', asOf: Date.now(),
        today: [s('asia'), s('london'), s('ny')],
        prior: null, pipelinePending: false,
      }).success,
    ).toBe(true);
  });

  it('accepts prior sessions', () => {
    expect(
      GetSessionLevelsOutputSchema.safeParse({
        symbol: 'EURUSD', asOf: Date.now(),
        today: [s('asia')], prior: [s('london')], pipelinePending: false,
      }).success,
    ).toBe(true);
  });
});

describe('GetCorrelationOutputSchema', () => {
  it('validates a correlation matrix', () => {
    expect(
      GetCorrelationOutputSchema.safeParse({
        tf: '1h', windowBars: 100, asOf: Date.now(),
        matrix: [{ a: 'EURUSD', b: 'GBPUSD', r: 0.85 }],
        dxyProxy: { value: 100.5, change24h: 0.15, samples: 24, formula: '50% EURUSD + 50% GBPUSD' },
      }).success,
    ).toBe(true);
  });
});

describe('ReplaySetupOutputSchema', () => {
  it('validates a thin (no-trade) result', () => {
    expect(
      ReplaySetupOutputSchema.safeParse({
        symbol: 'EURUSD', tf: '1h', asOf: Date.now(), ruleLabel: 'ema_cross 5/20 long',
        trades: [], count: 0, wins: 0, losses: 0, hitRate: 0, avgR: 0, totalR: 0,
        thin: true, notes: 'No trades.',
      }).success,
    ).toBe(true);
  });

  it('validates a trade result', () => {
    expect(
      ReplaySetupOutputSchema.safeParse({
        symbol: 'EURUSD', tf: '1h', asOf: Date.now(), ruleLabel: 'rsi 14/30 long',
        trades: [{ entryAt: 1_700_000_000_000, exitAt: 1_700_003_600_000, side: 'long',
          entry: 1.08, exit: 1.082, stop: 1.075, target: 1.084, reason: 'tp', rMultiple: 2, barsInTrade: 3 }],
        count: 1, wins: 1, losses: 0, hitRate: 1, avgR: 2, totalR: 2, thin: false, notes: '1 trade.',
      }).success,
    ).toBe(true);
  });
});

describe('remaining output schemas', () => {
  const cases: Array<{
    name: string; schema: { safeParse: (d: unknown) => { success: boolean } }; sample: unknown
  }> = [
    {
      name: 'AnalyzeChartImageOutputSchema',
      schema: AnalyzeChartImageOutputSchema,
      sample: {
        symbol: null, tf: null, trend: null, bias: null,
        levels: [{ price: 1.08, label: 'support' }],
        observed: 'Chart shows consolidation.', overlay: null,
        sourceImageRef: 'abc123def456',
      },
    },
    {
      name: 'AnnotateChartOutputSchema',
      schema: AnnotateChartOutputSchema,
      sample: {
        symbol: 'EURUSD', tf: '1h', asOf: Date.now(), markers: [],
        priceLines: [{ price: 1.085, color: 'red', lineWidth: '1', lineStyle: '0', axisLabelVisible: true, title: 'R' }],
        countsByKind: { swings: 2, bos_choch: 1, fvg: 0, order_blocks: 0, liquidity: 0, pdh_pdl: 0, asian_range: 0 },
      },
    },
    {
      name: 'GetIndicatorsOutputSchema',
      schema: GetIndicatorsOutputSchema,
      sample: {
        symbol: 'EURUSD', tf: '1h',
        results: [{ symbol: 'EURUSD', tf: '1h', kind: 'ema', params: { period: 50 }, values: [1.0801, 1.0803], fetchedAt: Date.now() }],
      },
    },
    {
      name: 'GetMarketStructureOutputSchema',
      schema: GetMarketStructureOutputSchema,
      sample: {
        symbol: 'EURUSD', tf: '1h', bars: 200,
        swings: [{ type: 'high', price: 1.085, time: 1_700_000_000_000, lookback: 3, index: 100 }],
        events: [{ kind: 'bos', direction: 'bullish', brokenAt: 1_700_000_000_000, time: 1_699_000_000_000, level: 1.082, swingIndex: 5 }],
        summary: 'BOS detected.',
      },
    },
    {
      name: 'GetCoTOutputSchema',
      schema: GetCoTOutputSchema,
      sample: {
        symbol: 'EURUSD',
        samples: [{ reportDate: Date.now(), dealerLong: 100, dealerShort: 200, assetLong: null, assetShort: null, leveragedLong: 300, leveragedShort: 150, otherLong: null, otherShort: null }],
        summary: 'Net commercial short.', pipelinePending: false,
      },
    },
    {
      name: 'GetIntermarketOutputSchema',
      schema: GetIntermarketOutputSchema,
      sample: {
        tf: '1h', windowBars: 100, asOf: Date.now(),
        dxyProxy: { value: 104.5, change24h: 0.1, formula: '50% EURUSD + 50% GBPUSD' },
        goldChange24h: 0.5, xauDxyCorrelation: -0.8,
        regime: 'neutral', regimeBreak: false, notes: 'Mixed signals.', partial: false,
      },
    },
    {
      name: 'GetIntermarketResonanceOutputSchema',
      schema: GetIntermarketResonanceOutputSchema,
      sample: {
        symbol: 'XAUUSD', days: 30, observations: [],
        currentDivergence: 0.2, currentRealYield: 1.5, currentBreakevenInflation: 2.3,
        regime: 'convergent', narrative: 'Yields and gold moving together.',
      },
    },
    {
      name: 'GetJournalStatsOutputSchema',
      schema: GetJournalStatsOutputSchema,
      sample: {
        stats: { count: 10, wins: 6, losses: 3, breakevens: 1, open: 0, winRate: 0.6, avgR: 1.5, totalR: 15 },
        bySymbol: [{ key: 'EURUSD', count: 5, winRate: 0.6, avgR: 1.2 }],
        byTag: [{ key: 'momentum', count: 3, winRate: 0.67, avgR: 1.8 }],
      },
    },
    {
      name: 'GetSeasonalityOutputSchema',
      schema: GetSeasonalityOutputSchema,
      sample: {
        symbol: 'EURUSD', granularity: 'month', asOf: Date.now(),
        buckets: [{ key: 1, label: 'Jan', count: 20, medianReturnPct: 0.002, q1Pct: -0.01, q3Pct: 0.015, winRate: 0.55 }],
        sampleSize: 100, thin: false,
      },
    },
    {
      name: 'ForecastVolatilityOutputSchema',
      schema: ForecastVolatilityOutputSchema,
      sample: {
        symbol: 'EURUSD', tf: '1h', horizonHours: 24, asOf: Date.now(),
        atrPips: 15, atrPipsBaseline30d: 12, expectedMovePips: 30,
        expectedRange: { low: 1.078, high: 1.082, mid: 1.08 },
        eventAdjusted: false, eventMultiplier: 1.0,
        nextHighImpact: null, notes: 'Normal volatility.',
      },
    },
    {
      name: 'ComputePositionHealthOutputSchema',
      schema: ComputePositionHealthOutputSchema,
      sample: {
        asOf: Date.now(), rows: [], partial: false, empty: true,
      },
    },
    {
      name: 'GetPortfolioSnapshotOutputSchema',
      schema: GetPortfolioSnapshotOutputSchema,
      sample: {
        asOf: Date.now(), positions: [], risk: null, empty: true,
      },
    },
    {
      name: 'GetSocialSentimentOutputSchema',
      schema: GetSocialSentimentOutputSchema,
      sample: {
        symbol: 'EURUSD', overall: 'neutral', overallScore: 0.1,
        contrarianSignal: false, contrarianNote: null,
        sources: [{ source: 'reddit', sentiment: 'neutral', score: 0.0, retailLongPct: null, sampleSize: 100, available: true }],
        fetchedAt: Date.now(), available: true,
      },
    },
    {
      name: 'SummarizeThreadOutputSchema',
      schema: SummarizeThreadOutputSchema,
      sample: {
        threadId: '550e8400-e29b-41d4-a716-446655440000', asOf: Date.now(),
        synopsis: 'Discussion about EURUSD.', insights: [{ text: 'Monitor resistance.', symbol: null }],
        remembered: true,
      },
    },
    {
      name: 'VerifyCallOutputSchema',
      schema: VerifyCallOutputSchema,
      sample: {
        symbol: 'EURUSD', asOf: Date.now(), side: 'long', entry: 1.08, stop: 1.075, target: 1.09,
        agree: true, caveats: [], nearestOpposingLiquidity: null,
        rationale: 'Setup looks good.',
      },
    },
    {
      name: 'RunSystemActionOutputSchema',
      schema: RunSystemActionOutputSchema,
      sample: {
        action: 'resonance_sync', status: 'success',
        consoleLogs: ['Starting sync...', 'Done.'], executionTimeMs: 1200, message: 'Sync completed.',
      },
    },
    {
      name: 'SetAlertOutputSchema',
      schema: SetAlertOutputSchema,
      sample: { alertId: 'alert_001', describes: 'XAUUSD 1h close above 2400' },
    },
    {
      name: 'ShareSnapshotOutputSchema',
      schema: ShareSnapshotOutputSchema,
      sample: { id: '550e8400-e29b-41d4-a716-446655440000', url: 'https://hamafx.io/snap/abc123', expiresAt: Date.now() + 86400000 },
    },
    {
      name: 'SearchKnowledgeOutputSchema',
      schema: SearchKnowledgeOutputSchema,
      sample: {
        items: [{ id: 'kb_001', title: 'Trading Plan', summary: 'Focus on EURUSD.',
          url: 'https://example.com', source: 'manual', publisher: null, publishedAt: Date.now(),
          sentiment: null, sentimentScore: null, similarity: 0.95 }],
        model: 'text-embedding-3-small', pipelinePending: false,
      },
    },
    {
      name: 'LogJournalOutputSchema',
      schema: LogJournalOutputSchema,
      sample: { entryId: '550e8400-e29b-41d4-a716-446655440000', summary: 'Logged: Test entry.' },
    },
    {
      name: 'ConveneCommitteeOutputSchema',
      schema: ConveneCommitteeOutputSchema,
      sample: {
        symbol: 'EURUSD', side: 'long', entry: 1.08, stop: 1.075, target: 1.09,
        verdicts: [
          { persona: 'economist', verdict: 'bullish', confidence: 8, keyPoints: ['Strong data'], risk: 'Inflation surprise', recommendation: 'Enter' },
          { persona: 'technician', verdict: 'bullish', confidence: 7, keyPoints: ['Trend up'], risk: 'RSI overbought', recommendation: 'Enter' },
          { persona: 'risk_manager', verdict: 'neutral', confidence: 6, keyPoints: ['Manage size'], risk: 'Gap risk', recommendation: 'Half position' },
        ],
        grade: 'B', goNoGo: 'caution', consensus: 'Favorable but manage risk.',
      },
    },
    {
      name: 'AnalyzeFundamentalOutputSchema',
      schema: AnalyzeFundamentalOutputSchema,
      sample: {
        symbol: 'EURUSD', windowFromMs: Date.now(), windowToMs: Date.now() + 86400000,
        currencies: ['EUR', 'USD'], events: [], headlines: [],
        sentiment: { positive: 0, negative: 0, neutral: 0 },
        summary: 'EURUSD window: no events; no headlines.', pipelinePending: true,
      },
    },
  ];

  for (const { name, schema, sample } of cases) {
    it(`${name} validates its sample data`, () => {
      const result = schema.safeParse(sample);
      if (!result.success) {
        console.error(`${name} error:`, JSON.stringify((result as unknown as { error: unknown }).error, null, 2));
      }
      expect(result.success).toBe(true);
    });
  }
});
