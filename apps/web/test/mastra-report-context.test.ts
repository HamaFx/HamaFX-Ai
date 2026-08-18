import { describe, expect, it } from 'vitest';

import { extractLatestMastraReport, mayReferToMastraReport } from '@/lib/services/mastra-report-context';

const report = {
  symbol: 'XAUUSD',
  asOf: '2026-08-18T12:00:00.000Z',
  dataQuality: 'complete',
  bias: 'bullish',
  confidence: 0.7,
  regime: 'trend',
  bottomLine: 'Bullish above support.',
  technicalSummary: 'Higher timeframe is constructive.',
  fundamentalSummary: 'Macro context is mixed.',
  scenarios: [
    { name: 'bullish', direction: 'bullish', trigger: 'breakout', entryZone: '2400', invalidation: '2380', targets: ['2440'], risks: ['news'], evidenceIds: ['price-1'] },
    { name: 'bearish', direction: 'bearish', trigger: 'breakdown', invalidation: '2440', targets: ['2380'], risks: ['volatility'], evidenceIds: ['price-1'] },
  ],
  contradictions: ['Short timeframe is weaker.'],
  missingData: [],
  numericClaims: [{ label: 'price', value: 2400, evidenceId: 'price-1', tolerance: 0.01 }],
  evidenceIds: ['price-1'],
  sources: [{ evidenceId: 'price-1', source: 'fixture', dataAsOf: '2026-08-18T12:00:00.000Z' }],
};

describe('mastra report context', () => {
  it('only considers explanation-style prompts for report lookup', () => {
    expect(mayReferToMastraReport('Why is the invalidation important?')).toBe(true);
    expect(mayReferToMastraReport('Sell gold now')).toBe(false);
    expect(mayReferToMastraReport('Tell me a joke')).toBe(false);
  });

  it('extracts only schema-valid reports from persisted assistant parts', () => {
    const messages = [
      { id: 'assistant-1', threadId: 'thread-1', role: 'assistant' as const, content: '', parts: [{ type: 'data-multi-agent-meta', data: { report } }], createdAt: 1 },
      { id: 'assistant-2', threadId: 'thread-1', role: 'assistant' as const, content: '', parts: [{ type: 'data-multi-agent-meta', data: { report: { ...report, symbol: 'BTCUSD' } } }], createdAt: 2 },
    ];
    expect(extractLatestMastraReport(messages)?.symbol).toBe('XAUUSD');
  });

  it('returns null when no trusted report exists', () => {
    expect(extractLatestMastraReport([{ id: 'assistant-1', threadId: 'thread-1', role: 'assistant', content: '', parts: [], createdAt: 1 }])).toBeNull();
  });
});
