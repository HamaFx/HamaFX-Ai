import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { LibSQLStore } from '@mastra/libsql';
import { RequestContext } from '@mastra/core/request-context';
import type { LanguageModel } from 'ai';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createKestrelMastra,
  initializeKestrelMastra,
} from '../src/mastra-v2';
import { createSymbolResearchWorkflow } from '../src/mastra-v2/workflows/symbol-research';

const mocks = vi.hoisted(() => ({
  collectSymbolResearchPacket: vi.fn(),
  /** Hard 4xx error thrown for the risk specialist (permanent → marker). */
  failRisk: false,
  /** Number of transient 429s before succeeding. */
  rateLimitFailures: 0,
}));

vi.mock('../src/mastra/symbol-research', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('../src/mastra/symbol-research');
  return { ...actual, collectSymbolResearchPacket: mocks.collectSymbolResearchPacket };
});
vi.mock('@mastra/core/agent', () => ({
  Agent: class {
    readonly id: string;

    constructor(options: { id: string }) {
      this.id = options.id;
    }

    async generate(): Promise<unknown> {
      if (mocks.failRisk && this.id.includes('risk')) {
        // A hard 4xx is permanent: the step returns an error marker (no retry),
        // and Full-mode verify turns it into a terminal strict failure.
        throw Object.assign(new Error('bad request shape'), { statusCode: 400 });
      }
      if (mocks.rateLimitFailures > 0 && !this.id.includes('decision')) {
        mocks.rateLimitFailures -= 1;
        throw Object.assign(new Error('You exceeded your current quota'), { statusCode: 429 });
      }
      if (this.id.includes('decision')) {
        return {
          text: 'Synthesized read.',
          usage: { inputTokens: 20, outputTokens: 10 },
          steps: [{}],
        };
      }
      return {
        object: {
          bias: 'neutral',
          confidence: 0.6,
          reasoning: `${this.id} opinion`,
          details: { source: 'packet' },
        },
        usage: { inputTokens: 10, outputTokens: 5 },
        steps: [{}],
      };
    }
  },
}));

const readyPacket = {
  packetId: 'packet-1',
  kind: 'symbol_research_packet' as const,
  symbol: 'EURUSD',
  generatedAt: '2026-08-19T12:00:00.000Z',
  status: 'ready' as const,
  dataQuality: 'complete' as const,
  price: null,
  timeframes: [],
  optionalContext: { available: false, reason: 'not configured' },
  missingData: [],
  warnings: [],
};

const blockedPacket = {
  ...readyPacket,
  packetId: 'packet-blocked',
  status: 'blocked' as const,
  dataQuality: 'degraded' as const,
  missingData: ['Current EURUSD price is unavailable.'],
};

const model = {} as LanguageModel;
const deps = {
  model,
  modelId: 'google/gemini-3.6-flash',
  providerId: 'google',
  memory: undefined as never,
  specialistCallOptions: { thread: 'thread-1', resource: 'user-1' } as never,
  fusionCallOptions: { thread: 'thread-1', resource: 'user-1' } as never,
};

function contextFor(runId: string) {
  return new RequestContext([
    ['userId', 'user-1'],
    ['runId', runId],
    ['threadId', 'thread-1'],
    ['symbol', 'EURUSD'],
  ]) as never;
}

type RunResult = { status: string; result?: unknown; error?: { message?: string } };

async function startWorkflow(
  workflow: ReturnType<typeof createSymbolResearchWorkflow>,
  runId: string,
  inputData: { prompt: string; symbol: string; mode: string },
): Promise<RunResult> {
  const run = await workflow.createRun({ runId });
  return (await run.start({
    inputData,
    requestContext: contextFor(runId),
  })) as unknown as RunResult;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.failRisk = false;
  mocks.rateLimitFailures = 0;
  mocks.collectSymbolResearchPacket.mockReset().mockResolvedValue(readyPacket);
});

describe('symbol-research workflow', () => {
  it('fails closed with a graceful blocked output when the packet is blocked', async () => {
    mocks.collectSymbolResearchPacket.mockResolvedValue(blockedPacket);

    const workflow = createSymbolResearchWorkflow(deps, 'standard');
    const result = await startWorkflow(workflow, 'wf-blocked', {
      prompt: 'Analyse EURUSD',
      symbol: 'EURUSD',
      mode: 'standard',
    });

    expect(result.status).toBe('success');
    const output = result.result as {
      status: string;
      blockedText: string;
      stats: { inputTokens: number };
    };
    expect(output.status).toBe('blocked');
    expect(output.blockedText).toContain('EURUSD');
    expect(output.blockedText).toContain('price is unavailable');
    expect(output.stats.inputTokens).toBe(0);
  });

  it('runs Quick with a single specialist and formats directly (no fusion LLM call)', async () => {
    const workflow = createSymbolResearchWorkflow(deps, 'quick');
    const result = await startWorkflow(workflow, 'wf-quick', {
      prompt: 'Give me a quick technical read',
      symbol: 'EURUSD',
      mode: 'quick',
    });

    expect(result.status).toBe('success');
    const output = result.result as {
      status: string;
      finalText: string;
      opinions: unknown[];
    };
    expect(output.status).toBe('ready');
    expect(output.finalText).toContain('EURUSD quick technical read');
    expect(output.opinions).toHaveLength(1);
  });

  it('fails Full mode terminally when a specialist returns a permanent error marker', async () => {
    mocks.failRisk = true;

    const workflow = createSymbolResearchWorkflow(deps, 'full');
    const result = await startWorkflow(workflow, 'wf-strict', {
      prompt: 'Full committee analysis',
      symbol: 'EURUSD',
      mode: 'full',
    });

    expect(result.status).toBe('failed');
    expect(result.error?.message ?? '').toContain('Failed agents: risk');
  });

  it('retries a transient specialist rate-limit and completes Full with all opinions', async () => {
    mocks.rateLimitFailures = 1;

    const workflow = createSymbolResearchWorkflow(deps, 'full');
    const result = await startWorkflow(workflow, 'wf-retry', {
      prompt: 'Full committee analysis',
      symbol: 'EURUSD',
      mode: 'full',
    });

    expect(result.status).toBe('success');
    const output = result.result as { status: string; opinions: { agentName: string }[] };
    expect(output.status).toBe('ready');
    expect(output.opinions.map((opinion) => opinion.agentName).sort()).toEqual([
      'fundamental',
      'risk',
      'sentiment',
      'technical',
    ]);
  });

  it('persists run snapshots to the shared Mastra storage when an instance is provided', async () => {
    const file = join(tmpdir(), `kestrel-wf-snap-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
    const url = `file:${file}`;
    try {
      const store = new LibSQLStore({ id: 'test-store', url });
      const mastra = createKestrelMastra({ storage: store, storageKind: 'libsql', env: {} });
      await initializeKestrelMastra(mastra);

      const workflow = createSymbolResearchWorkflow(
        { ...deps, mastra: mastra.instance },
        'standard',
      );
      const result = await startWorkflow(workflow, 'wf-snap', {
        prompt: 'Analyse EURUSD',
        symbol: 'EURUSD',
        mode: 'standard',
      });

      expect(result.status).toBe('success');
      const state = await workflow.getWorkflowRunById('wf-snap');
      expect(state).not.toBeNull();
      expect((state as { workflowName?: string } | null)?.workflowName).toBe('symbol-research');
      expect(state?.status).toBe('success');
      expect(Object.keys(state?.steps ?? {})).toEqual(
        expect.arrayContaining([
          'collect-packet',
          'technical',
          'fundamental',
          'verify',
          'fusion',
        ]),
      );
    } finally {
      rmSync(file, { force: true });
    }
  });
});
