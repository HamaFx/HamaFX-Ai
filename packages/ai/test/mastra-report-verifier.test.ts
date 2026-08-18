import { describe, expect, it } from 'vitest';

import {
  requireVerifiedXauusdReport,
  verifyXauusdReport,
} from '../src/mastra/report-verifier';
import { XauusdResearchPacketSchema } from '../src/mastra/research-types';

const evidenceId = 'kestrel-price-xauusd-fixture';
const asOf = '2026-08-18T12:00:00.000Z';

function packet(
  status: 'ready' | 'blocked' = 'ready',
  warnings: string[] = [],
) {
  return XauusdResearchPacketSchema.parse({
    packetId: 'packet-1',
    kind: 'research_packet',
    symbol: 'XAUUSD',
    generatedAt: asOf,
    status,
    dataQuality: status === 'ready' ? 'partial' : 'degraded',
    timeframes: ['1d', '4h', '1h', '15m'],
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
    macro: null,
    missingData: ['Macro context is unavailable'],
    warnings,
  });
}

function report(overrides: Record<string, unknown> = {}) {
  return {
    symbol: 'XAUUSD',
    asOf,
    dataQuality: 'partial',
    bias: 'neutral',
    confidence: 0.5,
    regime: 'range',
    bottomLine: 'Evidence is mixed.',
    technicalSummary: 'The technical packet is mixed.',
    fundamentalSummary: 'Macro context was not collected.',
    scenarios: [
      {
        name: 'Bullish continuation',
        direction: 'bullish',
        trigger: 'Price breaks and holds above resistance.',
        invalidation: 'Price closes back below the breakout level.',
        targets: ['next resistance'],
        risks: ['false breakout'],
        evidenceIds: [evidenceId],
      },
      {
        name: 'Bearish rejection',
        direction: 'bearish',
        trigger: 'Price rejects resistance.',
        invalidation: 'Price closes above resistance.',
        targets: ['next support'],
        risks: ['short squeeze'],
        evidenceIds: [evidenceId],
      },
    ],
    contradictions: ['Timeframes are not fully aligned.'],
    missingData: ['Macro context is unavailable'],
    numericClaims: [{ label: 'current mid price', value: 2_345.1, evidenceId }],
    evidenceIds: [evidenceId],
    sources: [{ evidenceId, source: 'fixture', dataAsOf: asOf }],
    ...overrides,
  };
}

describe('XAUUSD report verifier', () => {
  it('accepts a report whose quality and evidence match the packet', () => {
    const result = verifyXauusdReport(report(), packet());

    expect(result.ok).toBe(true);
    expect(result.report?.symbol).toBe('XAUUSD');
    expect(result.findings).toEqual([]);
  });

  it('rejects unknown evidence IDs and dishonest complete quality', () => {
    const result = verifyXauusdReport(report({
      dataQuality: 'complete',
      evidenceIds: ['unknown-evidence'],
    }), packet());

    expect(result.ok).toBe(false);
    expect(result.findings).toEqual(expect.arrayContaining([
      'report.evidenceIds references unknown evidence ID: unknown-evidence',
      'The report claims complete data quality despite degraded or partial evidence.',
    ]));
  });

  it('rejects a report when the packet is blocked', () => {
    expect(() => requireVerifiedXauusdReport(report(), packet('blocked'))).toThrow(
      /failed deterministic verification/,
    );
  });

  it('rejects numeric claims that do not match the cited evidence', () => {
    const result = verifyXauusdReport(report({
      numericClaims: [{ label: 'invented price', value: 9_999, evidenceId }],
    }), packet());

    expect(result.ok).toBe(false);
    expect(result.findings).toContain(
      'report.numericClaims[0] is not supported by evidence kestrel-price-xauusd-fixture: invented price',
    );
  });

  it('rejects future timestamps and undisclosed stale evidence', () => {
    const result = verifyXauusdReport(report({ asOf: '2026-08-18T13:00:00.000Z' }), packet('ready', [
      'Price was served from stale-while-error cache',
    ]));

    expect(result.ok).toBe(false);
    expect(result.findings).toEqual(expect.arrayContaining([
      'The report timestamp is later than the research packet by more than five seconds.',
      'The report did not disclose stale or outdated evidence.',
    ]));
  });

  it('requires disclosure when timeframe EMA signals conflict', () => {
    const base = packet();
    const conflictPacket = XauusdResearchPacketSchema.parse({
      ...base,
      timeframes: ['1h', '4h'],
      indicators: [
        {
          evidenceId: 'indicators-1h',
          kind: 'indicators',
          symbol: 'XAUUSD',
          timeframe: '1h',
          source: 'fixture',
          fetchedAt: asOf,
          dataAsOf: asOf,
          freshness: 'fresh',
          quality: 'complete',
          warnings: [],
          data: {
            candleCount: 50,
            stale: false,
            results: [
              { symbol: 'XAUUSD', tf: '1h', kind: 'ema', params: { period: 20 }, values: [101], fetchedAt: Date.parse(asOf) },
              { symbol: 'XAUUSD', tf: '1h', kind: 'ema', params: { period: 50 }, values: [100], fetchedAt: Date.parse(asOf) },
            ],
          },
        },
        {
          evidenceId: 'indicators-4h',
          kind: 'indicators',
          symbol: 'XAUUSD',
          timeframe: '4h',
          source: 'fixture',
          fetchedAt: asOf,
          dataAsOf: asOf,
          freshness: 'fresh',
          quality: 'complete',
          warnings: [],
          data: {
            candleCount: 50,
            stale: false,
            results: [
              { symbol: 'XAUUSD', tf: '4h', kind: 'ema', params: { period: 20 }, values: [99], fetchedAt: Date.parse(asOf) },
              { symbol: 'XAUUSD', tf: '4h', kind: 'ema', params: { period: 50 }, values: [100], fetchedAt: Date.parse(asOf) },
            ],
          },
        },
      ],
    });

    const result = verifyXauusdReport(report({ contradictions: [] }), conflictPacket);

    expect(result.ok).toBe(false);
    expect(result.findings).toContain(
      'The report did not disclose a conflict between timeframe trend signals.',
    );
  });

  it('rejects reports without scenario risk or invalidation', () => {
    const result = verifyXauusdReport(report({
      scenarios: [
        { ...report().scenarios[0], invalidation: '', risks: [] },
        report().scenarios[1],
      ],
    }), packet());

    expect(result.ok).toBe(false);
    expect(result.findings).toEqual(expect.arrayContaining([
      'scenarios.0.invalidation: String must contain at least 1 character(s)',
    ]));
  });
});
