import { describe, expect, it } from 'vitest';

import {
  buildXauusdModelEvidenceContext,
  MODEL_CONTEXT_CANDLE_LIMIT,
  MODEL_CONTEXT_INDICATOR_LIMIT,
  serializeXauusdModelEvidenceContext,
} from '../src/mastra/model-context';
import type { XauusdResearchPacket } from '../src/mastra/research-types';

function packetFixture(): XauusdResearchPacket {
  const timestamp = new Date('2026-08-18T12:00:00.000Z').toISOString();
  const candles = Array.from({ length: 40 }, (_, index) => ({
    symbol: 'XAUUSD' as const,
    tf: '1h' as const,
    t: 1_700_000_000_000 + index * 3_600_000,
    o: 2_000 + index,
    h: 2_005 + index,
    l: 1_995 + index,
    c: 2_002 + index,
    v: null,
    source: 'fixture-provider',
    fetchedAt: 1_700_000_000_000,
  }));
  const results = Array.from({ length: 6 }, (_, index) => ({
    symbol: 'XAUUSD' as const,
    tf: '1h' as const,
    kind: index === 0 ? 'ema' as const : 'rsi' as const,
    params: { period: index === 0 ? 20 : 14 },
    values: Array.from({ length: 30 }, (_, valueIndex) => valueIndex + index),
    fetchedAt: 1_700_000_000_000,
  }));

  return {
    packetId: 'packet-1',
    kind: 'research_packet',
    symbol: 'XAUUSD',
    generatedAt: timestamp,
    status: 'ready',
    dataQuality: 'partial',
    timeframes: ['1h'],
    price: null,
    candles: [{
      evidenceId: 'candles-1h',
      kind: 'candles',
      symbol: 'XAUUSD',
      timeframe: '1h',
      source: 'fixture-provider',
      fetchedAt: timestamp,
      dataAsOf: timestamp,
      freshness: 'fresh',
      quality: 'complete',
      warnings: [],
      data: { candles, stale: false, count: candles.length },
    }],
    indicators: [{
      evidenceId: 'indicators-1h',
      kind: 'indicators',
      symbol: 'XAUUSD',
      timeframe: '1h',
      source: 'fixture-provider',
      fetchedAt: timestamp,
      dataAsOf: timestamp,
      freshness: 'fresh',
      quality: 'complete',
      warnings: [],
      data: { results, candleCount: candles.length, stale: false },
    }],
    missingData: ['Macro context is unavailable.'],
    warnings: ['Macro context is unavailable.'],
  };
}

describe('Mastra model evidence context', () => {
  it('bounds candle and indicator series without losing provenance', () => {
    const context = buildXauusdModelEvidenceContext(packetFixture());
    const candleEvidence = context.candles[0]!;
    const indicatorEvidence = context.indicators[0]!;

    expect(candleEvidence.data.candles).toHaveLength(MODEL_CONTEXT_CANDLE_LIMIT);
    expect(candleEvidence.data.candles[0]?.t).toBe(1_700_000_000_000 + 28 * 3_600_000);
    expect(candleEvidence.data.count).toBe(40);
    expect(candleEvidence.evidenceId).toBe('candles-1h');
    expect(candleEvidence.dataAsOf).toBe('2026-08-18T12:00:00.000Z');
    expect(indicatorEvidence.data.results[0]?.values).toHaveLength(MODEL_CONTEXT_INDICATOR_LIMIT);
    expect(indicatorEvidence.data.results[0]?.values).toEqual([27, 28, 29]);
    expect(context.missingData).toEqual(['Macro context is unavailable.']);
  });

  it('serializes a compact JSON-safe context for Mastra instructions', () => {
    const serialized = serializeXauusdModelEvidenceContext(packetFixture());
    const parsed = JSON.parse(serialized) as ReturnType<typeof buildXauusdModelEvidenceContext>;

    expect(parsed.kind).toBe('model_evidence_context');
    expect(parsed.candles[0]!.data.candles).toHaveLength(MODEL_CONTEXT_CANDLE_LIMIT);
    expect(serialized).not.toContain('"t":1700000000000');
  });
});
