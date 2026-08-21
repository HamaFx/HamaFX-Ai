import { metrics } from '@kestrel/shared';
import { RequestContext } from '@mastra/core/request-context';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createXauusdReportWorkflow } from '../src/mastra-v2/workflows/xauusd-report';
import { patchTimeframeConflictDisclosure } from '../src/mastra/report-repair';
import { XauusdResearchPacketSchema } from '../src/mastra/research-types';

const mocks = vi.hoisted(() => {
  class FakeVerificationError extends Error {
    readonly findings: readonly string[];

    constructor(findings: readonly string[]) {
      super('verification failed');
      this.name = 'XauusdReportVerificationError';
      this.findings = findings;
    }
  }

  return {
    requireVerifiedXauusdReport: vi.fn(),
    verifyXauusdReport: vi.fn((candidate: unknown) => ({
      ok: true,
      report: candidate,
      findings: [],
    })),
    collectXauusdResearchPacket: vi.fn(),
    FakeVerificationError,
  };
});

vi.mock('../src/mastra/report-verifier', () => ({
  requireVerifiedXauusdReport: mocks.requireVerifiedXauusdReport,
  verifyXauusdReport: mocks.verifyXauusdReport,
  XauusdReportVerificationError: mocks.FakeVerificationError,
}));
vi.mock('../src/mastra/research-packet', () => ({
  collectXauusdResearchPacket: mocks.collectXauusdResearchPacket,
}));

const packet = XauusdResearchPacketSchema.parse({
  packetId: 'packet-1',
  kind: 'research_packet',
  symbol: 'XAUUSD',
  generatedAt: new Date().toISOString(),
  status: 'ready',
  dataQuality: 'complete',
  timeframes: ['1d', '4h', '1h', '15m'],
  price: null,
  candles: [],
  indicators: [],
  macro: null,
  missingData: [],
  warnings: [],
});

const report = {
  symbol: 'XAUUSD',
  asOf: new Date().toISOString(),
  dataQuality: 'complete',
  bias: 'neutral',
  confidence: 0.5,
  regime: 'range',
  bottomLine: 'Test report',
  technicalSummary: 'Test technical summary',
  fundamentalSummary: 'Unavailable',
  scenarios: [
    {
      name: 'Bullish',
      direction: 'bullish',
      trigger: 'breakout',
      invalidation: 'below level',
      targets: [],
      risks: ['volatility'],
      evidenceIds: ['packet-1'],
    },
    {
      name: 'Bearish',
      direction: 'bearish',
      trigger: 'breakdown',
      invalidation: 'above level',
      targets: [],
      risks: ['volatility'],
      evidenceIds: ['packet-1'],
    },
  ],
  contradictions: [],
  missingData: [],
  numericClaims: [{ label: 'Test claim', value: 1, evidenceId: 'packet-1' }],
  evidenceIds: ['packet-1'],
  sources: [{ evidenceId: 'packet-1', source: 'fixture', dataAsOf: new Date().toISOString() }],
};

function agentWithResults(...results: unknown[]) {
  const generate = vi.fn();
  for (const result of results) generate.mockResolvedValueOnce(result);
  return { agent: { generate } as never, generate };
}

async function runWorkflow(generate: ReturnType<typeof vi.fn>, prompt = 'Analyse gold') {
  const workflow = createXauusdReportWorkflow({
    agent: { generate } as never,
    callOptions: {} as never,
    providerId: 'mistral',
  });
  const run = await workflow.createRun({ runId: 'run-repair' });
  const result = await run.start({
    inputData: { prompt },
    requestContext: new RequestContext([
      ['userId', 'user-1'],
      ['runId', 'run-repair'],
      ['threadId', 'thread-1'],
    ]) as never,
  });
  return result as unknown as {
    status: string;
    result?: unknown;
    error?: { name?: string; message?: string; findings?: readonly string[] };
  };
}

describe('Mastra XAUUSD report workflow repair', () => {
  beforeEach(() => {
    mocks.requireVerifiedXauusdReport.mockReset();
    mocks.collectXauusdResearchPacket.mockReset().mockResolvedValue(packet);
    metrics.reset();
  });

  it('verifies the first generation and completes without repair', async () => {
    mocks.requireVerifiedXauusdReport.mockReturnValue(report);
    const { generate } = agentWithResults({ object: { ok: true }, text: 'first' });

    const result = await runWorkflow(generate);

    expect(result.status).toBe('success');
    const output = result.result as {
      status: string;
      report: unknown;
      attempts: number;
    };
    expect(output.status).toBe('ready');
    expect(output.report).toMatchObject(report);
    expect(output.attempts).toBe(1);
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it('repairs once using verifier findings and returns the corrected report', async () => {
    mocks.requireVerifiedXauusdReport
      .mockImplementationOnce(() => {
        throw new mocks.FakeVerificationError([
          'The report did not disclose a conflict between timeframe trend signals.',
        ]);
      })
      .mockReturnValue(report);
    const { generate } = agentWithResults(
      { object: { invalid: true }, text: 'first' },
      { object: { corrected: true }, text: 'second' },
    );

    const result = await runWorkflow(generate);

    expect(result.status).toBe('success');
    const output = result.result as { status: string; report: unknown; attempts: number };
    expect(output.status).toBe('ready');
    expect(output.report).toMatchObject(report);
    expect(output.attempts).toBe(2);
    expect(generate).toHaveBeenCalledTimes(2);
    expect(generate.mock.calls[1]?.[0]).toContain('conflict between timeframe trend signals');
    expect(metrics.snapshot().counters['mastra_report_repair_total{result=passed}']).toBe(1);
    expect(metrics.snapshot().counters['mastra_report_repair_total{result=requested}']).toBe(1);
  });

  it('retries a structured-output validation failure before the verifier runs', async () => {
    const structuredError = new Error('Structured output validation failed') as Error & {
      cause?: unknown;
    };
    structuredError.cause = {
      issues: [{ path: ['scenarios'], message: 'Array must contain at least 2 element(s)' }],
    };

    mocks.requireVerifiedXauusdReport.mockReturnValue(report);
    const { generate } = agentWithResults();
    generate
      .mockRejectedValueOnce(structuredError)
      .mockResolvedValueOnce({ object: { corrected: true }, text: 'second' });

    const result = await runWorkflow(generate);

    expect(result.status).toBe('success');
    const output = result.result as { status: string; report: unknown; attempts: number };
    expect(output.status).toBe('ready');
    expect(output.report).toMatchObject(report);
    expect(output.attempts).toBe(2);
    expect(generate).toHaveBeenCalledTimes(2);
    expect(generate.mock.calls[1]?.[0]).toContain('scenarios');
    expect(metrics.snapshot().counters['mastra_report_repair_total{result=requested}']).toBe(1);
    expect(metrics.snapshot().counters['mastra_report_repair_total{result=passed}']).toBe(1);
  });

  it('adds only the deterministic timeframe-conflict disclosure after repair exhaustion', () => {
    const asOf = '2026-08-18T12:00:00.000Z';
    const evidence = (evidenceId: string, timeframe: '1h' | '4h', fast: number, slow: number) => ({
      evidenceId,
      kind: 'indicators' as const,
      symbol: 'XAUUSD' as const,
      timeframe,
      source: 'fixture',
      fetchedAt: asOf,
      dataAsOf: asOf,
      freshness: 'fresh' as const,
      quality: 'complete' as const,
      warnings: [],
      data: {
        results: [
          {
            symbol: 'XAUUSD' as const,
            tf: timeframe,
            kind: 'ema' as const,
            params: { period: 20 },
            values: [fast],
            fetchedAt: Date.parse(asOf),
          },
          {
            symbol: 'XAUUSD' as const,
            tf: timeframe,
            kind: 'ema' as const,
            params: { period: 50 },
            values: [slow],
            fetchedAt: Date.parse(asOf),
          },
        ],
        candleCount: 50,
        stale: false,
      },
    });
    const conflictPacket = XauusdResearchPacketSchema.parse({
      packetId: 'conflict-packet',
      kind: 'research_packet',
      symbol: 'XAUUSD',
      generatedAt: asOf,
      status: 'ready',
      dataQuality: 'partial',
      timeframes: ['1h', '4h'],
      price: null,
      candles: [],
      indicators: [evidence('ind-1h', '1h', 2, 1), evidence('ind-4h', '4h', 1, 2)],
      macro: null,
      missingData: ['Macro unavailable'],
      warnings: [],
    });
    const candidate = {
      symbol: 'XAUUSD',
      asOf,
      dataQuality: 'partial',
      bias: 'neutral',
      confidence: 0.5,
      regime: 'mixed',
      bottomLine: 'Mixed.',
      technicalSummary: 'Mixed.',
      fundamentalSummary: 'Unavailable.',
      scenarios: [
        {
          name: 'Bullish',
          direction: 'bullish',
          trigger: 'breakout',
          invalidation: 'below',
          targets: [],
          risks: ['volatility'],
          evidenceIds: ['ind-1h'],
        },
        {
          name: 'Bearish',
          direction: 'bearish',
          trigger: 'breakdown',
          invalidation: 'above',
          targets: [],
          risks: ['volatility'],
          evidenceIds: ['ind-4h'],
        },
      ],
      contradictions: [],
      missingData: ['Macro unavailable'],
      numericClaims: [{ label: 'EMA 20', value: 2, evidenceId: 'ind-1h', tolerance: 0.01 }],
      evidenceIds: ['ind-1h', 'ind-4h'],
      sources: [{ evidenceId: 'ind-1h', source: 'fixture', dataAsOf: asOf }],
    };

    const patched = patchTimeframeConflictDisclosure(candidate, conflictPacket, [
      'The report did not disclose a conflict between timeframe trend signals.',
    ]);

    expect(patched?.contradictions).toContain(
      'Timeframe trend signals are mixed; higher and lower timeframes do not fully agree.',
    );
  });

  it('stops after the repair limit and records exhaustion', async () => {
    const error = new mocks.FakeVerificationError(['missing contradiction disclosure']);
    mocks.requireVerifiedXauusdReport.mockImplementation(() => {
      throw error;
    });
    // REPORT_REPAIR_LIMIT is 2 repairs past the initial attempt → 3 generations.
    const { generate } = agentWithResults(
      { object: { invalid: true }, text: 'first' },
      { object: { invalid: true }, text: 'second' },
      { object: { invalid: true }, text: 'third' },
    );

    const result = await runWorkflow(generate);

    expect(result.status).toBe('failed');
    expect(generate).toHaveBeenCalledTimes(3);
    expect(result.error).toMatchObject({ name: 'XauusdReportVerificationError' });
    expect(result.error).toMatchObject({ findings: ['missing contradiction disclosure'] });
    expect(metrics.snapshot().counters['mastra_report_repair_total{result=failed}']).toBe(1);
  });
});
