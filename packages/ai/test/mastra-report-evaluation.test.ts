import { beforeEach, describe, expect, it } from 'vitest';

import { metrics } from '@kestrel/shared';

import {
  evaluateXauusdReportCase,
  summarizeXauusdReportEvaluations,
} from '../src/mastra/report-evaluation';
import { XauusdResearchPacketSchema } from '../src/mastra/research-types';

const asOf = '2026-08-18T12:00:00.000Z';
const evidenceId = 'price-fixture';

function packet() {
  return XauusdResearchPacketSchema.parse({
    packetId: 'packet-eval',
    kind: 'research_packet',
    symbol: 'XAUUSD',
    generatedAt: asOf,
    status: 'ready',
    dataQuality: 'partial',
    timeframes: ['1h'],
    price: {
      evidenceId,
      kind: 'price',
      symbol: 'XAUUSD',
      source: 'fixture',
      fetchedAt: asOf,
      dataAsOf: asOf,
      freshness: 'fresh',
      quality: 'complete',
      warnings: [],
      data: {
        tick: {
          symbol: 'XAUUSD',
          bid: 2_345,
          ask: 2_345.2,
          mid: 2_345.1,
          ts: Date.parse(asOf),
          source: 'fixture',
        },
        stale: false,
        ageMs: 100,
      },
    },
    candles: [],
    indicators: [],
    missingData: ['Macro context is unavailable'],
    warnings: [],
  });
}

function report(value = 2_345.1) {
  return {
    symbol: 'XAUUSD',
    asOf,
    dataQuality: 'partial',
    bias: 'neutral',
    confidence: 0.5,
    regime: 'range',
    bottomLine: 'Evidence is mixed.',
    technicalSummary: 'Technical evidence is mixed.',
    fundamentalSummary: 'Macro context was not collected.',
    scenarios: [
      {
        name: 'Bullish',
        direction: 'bullish',
        trigger: 'Breakout above resistance.',
        invalidation: 'Close below resistance.',
        targets: [],
        risks: ['false breakout'],
        evidenceIds: [evidenceId],
      },
      {
        name: 'Bearish',
        direction: 'bearish',
        trigger: 'Rejection at resistance.',
        invalidation: 'Close above resistance.',
        targets: [],
        risks: ['short squeeze'],
        evidenceIds: [evidenceId],
      },
    ],
    contradictions: [],
    missingData: ['Macro context is unavailable'],
    numericClaims: [{ label: 'mid price', value, evidenceId }],
    evidenceIds: [evidenceId],
    sources: [{ evidenceId, source: 'fixture', dataAsOf: asOf }],
  };
}

beforeEach(() => metrics.reset());

describe('Mastra XAUUSD report evaluation', () => {
  it('passes an expected-valid grounded report and records an eval metric', () => {
    const result = evaluateXauusdReportCase({
      id: 'valid-grounded-report',
      packet: packet(),
      candidate: report(),
      expectedValid: true,
    });

    expect(result).toMatchObject({
      id: 'valid-grounded-report',
      actualValid: true,
      passed: true,
    });
    expect(metrics.snapshot().counters[
      'eval_case_total{result=ok,suite=mastra_xauusd_report}'
    ]).toBe(1);
  });

  it('passes an expected-invalid report when numeric grounding is rejected', () => {
    const result = evaluateXauusdReportCase({
      id: 'invalid-unsupported-number',
      packet: packet(),
      candidate: report(9_999),
      expectedValid: false,
    });

    expect(result.actualValid).toBe(false);
    expect(result.passed).toBe(true);
    expect(result.findings[0]).toContain('numericClaims');
  });

  it('summarizes mixed fixture outcomes', () => {
    const evaluations = [
      evaluateXauusdReportCase({ id: 'valid', packet: packet(), candidate: report(), expectedValid: true }),
      evaluateXauusdReportCase({ id: 'invalid', packet: packet(), candidate: report(9_999), expectedValid: false }),
    ];

    expect(summarizeXauusdReportEvaluations(evaluations)).toEqual({
      total: 2,
      passed: 2,
      failed: 0,
      passRate: 1,
    });
  });
});
