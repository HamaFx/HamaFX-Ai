import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { LibSQLStore } from '@mastra/libsql';
import { RequestContext } from '@mastra/core/request-context';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createKestrelMastra,
  initializeKestrelMastra,
} from '../src/mastra-v2';
import { createXauusdReportWorkflow } from '../src/mastra-v2/workflows/xauusd-report';
import { XauusdResearchPacketSchema } from '../src/mastra/research-types';

const mocks = vi.hoisted(() => ({
  collectXauusdResearchPacket: vi.fn(),
  requireVerifiedXauusdReport: vi.fn(),
}));

vi.mock('../src/mastra/research-packet', () => ({
  collectXauusdResearchPacket: mocks.collectXauusdResearchPacket,
}));
vi.mock('../src/mastra/report-verifier', () => ({
  requireVerifiedXauusdReport: mocks.requireVerifiedXauusdReport,
  XauusdReportVerificationError: class extends Error {
    readonly findings: readonly string[];

    constructor(findings: readonly string[]) {
      super('XAUUSD report failed deterministic verification');
      this.name = 'XauusdReportVerificationError';
      this.findings = findings;
    }
  },
}));

const blockedPacket = XauusdResearchPacketSchema.parse({
  packetId: 'packet-blocked',
  kind: 'research_packet',
  symbol: 'XAUUSD',
  generatedAt: new Date().toISOString(),
  status: 'blocked',
  dataQuality: 'degraded',
  timeframes: ['1d', '4h', '1h', '15m'],
  price: null,
  candles: [],
  indicators: [],
  macro: null,
  missingData: ['Current XAUUSD price is unavailable.'],
  warnings: [],
});

const readyPacket = XauusdResearchPacketSchema.parse({
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

function contextFor(runId: string) {
  return new RequestContext([
    ['userId', 'user-1'],
    ['runId', runId],
    ['threadId', 'thread-1'],
  ]) as never;
}

type RunResult = { status: string; result?: unknown; error?: { message?: string } };

async function startWorkflow(
  workflow: ReturnType<typeof createXauusdReportWorkflow>,
  runId: string,
  prompt: string,
): Promise<RunResult> {
  const run = await workflow.createRun({ runId });
  return (await run.start({
    inputData: { prompt },
    requestContext: contextFor(runId),
  })) as unknown as RunResult;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.collectXauusdResearchPacket.mockReset().mockResolvedValue(readyPacket);
  mocks.requireVerifiedXauusdReport.mockReset().mockReturnValue(report);
});

describe('xauusd-report workflow', () => {
  it('fails closed with a graceful blocked output when the packet is blocked', async () => {
    mocks.collectXauusdResearchPacket.mockResolvedValue(blockedPacket);
    const generate = vi.fn();

    const workflow = createXauusdReportWorkflow({
      agent: { generate } as never,
      callOptions: {} as never,
      providerId: 'mistral',
    });
    const result = await startWorkflow(workflow, 'xau-blocked', 'Analyse gold');

    expect(result.status).toBe('success');
    const output = result.result as {
      status: string;
      blockedText: string;
      stats: { inputTokens: number };
    };
    expect(output.status).toBe('blocked');
    expect(output.blockedText).toContain('XAUUSD');
    expect(generate).not.toHaveBeenCalled();
    expect(output.stats.inputTokens).toBe(0);
  });

  it('persists run snapshots including the repair attempt when an instance is provided', async () => {
    const file = join(tmpdir(), `kestrel-xau-snap-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
    const url = `file:${file}`;
    try {
      const store = new LibSQLStore({ id: 'test-store', url });
      const mastra = createKestrelMastra({ storage: store, storageKind: 'libsql', env: {} });
      await initializeKestrelMastra(mastra);

      // First generation fails verification, the repair step fixes it. The
      // thrown verification error must carry findings (like the real verifier).
      mocks.requireVerifiedXauusdReport
        .mockImplementationOnce(() => {
          throw Object.assign(new Error('verification failed'), {
            findings: ['missing contradiction disclosure'],
          });
        })
        .mockReturnValue(report);
      const generate = vi
        .fn()
        .mockResolvedValueOnce({ object: { invalid: true }, text: 'first', usage: { inputTokens: 5, outputTokens: 3 } })
        .mockResolvedValueOnce({ object: { valid: true }, text: 'second', usage: { inputTokens: 5, outputTokens: 3 } });

      const workflow = createXauusdReportWorkflow({
        agent: { generate } as never,
        callOptions: {} as never,
        providerId: 'mistral',
        mastra: mastra.instance,
      });
      const result = await startWorkflow(workflow, 'xau-snap', 'Analyse gold');

      expect(result.status).toBe('success');
      const output = result.result as { status: string; attempts: number };
      expect(output.status).toBe('ready');
      expect(output.attempts).toBe(2);

      const state = await workflow.getWorkflowRunById('xau-snap');
      expect(state).not.toBeNull();
      expect((state as { workflowName?: string } | null)?.workflowName).toBe('xauusd-research');
      expect(state?.status).toBe('success');
      expect(Object.keys(state?.steps ?? {})).toEqual(
        expect.arrayContaining(['collect-packet', 'generate', 'repair', 'finalize']),
      );
    } finally {
      rmSync(file, { force: true });
    }
  });
});
