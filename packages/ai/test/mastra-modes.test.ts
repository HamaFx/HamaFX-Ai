import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  resolveChatModel: vi.fn(),
  collectSymbolResearchPacket: vi.fn(),
  beginMastraRun: vi.fn(),
  finishMastraRun: vi.fn().mockResolvedValue(undefined),
  failRisk: false,
  /** Number of times a named specialist should throw a rate-limit error before succeeding. */
  rateLimitFailures: 0,
}));

vi.mock('../src/model', () => ({ resolveChatModel: mocks.resolveChatModel }));
vi.mock('../src/mastra/symbol-research', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('../src/mastra/symbol-research');
  return { ...actual, collectSymbolResearchPacket: mocks.collectSymbolResearchPacket };
});
vi.mock('../src/mastra/telemetry', () => ({
  beginMastraRun: mocks.beginMastraRun,
  finishMastraRun: mocks.finishMastraRun,
  getMastraGenerationStats: (result: { usage?: { inputTokens?: number; outputTokens?: number }; toolCalls?: unknown[]; steps?: unknown[] }) => ({
    inputTokens: result.usage?.inputTokens ?? 0,
    outputTokens: result.usage?.outputTokens ?? 0,
    toolCalls: result.toolCalls?.length ?? 0,
    steps: result.steps?.length ?? 1,
  }),
  mastraOutcomeForError: (error: unknown, signal?: AbortSignal) =>
    signal?.aborted || (error instanceof Error && error.name === 'AbortError') ? 'cancelled' : 'failed',
}));

vi.mock('@mastra/core/agent', () => ({
  Agent: class {
    readonly id: string;

    constructor(options: { id: string }) {
      this.id = options.id;
    }

    async generate(): Promise<unknown> {
      if (mocks.failRisk && this.id.includes('risk')) throw new Error('risk unavailable');
      if (mocks.rateLimitFailures > 0 && !this.id.includes('decision')) {
        mocks.rateLimitFailures -= 1;
        const rateLimited = Object.assign(new Error('You exceeded your current quota'), { statusCode: 429 });
        throw rateLimited;
      }
      if (this.id.includes('decision')) {
        return { text: 'Synthesized read.', usage: { inputTokens: 20, outputTokens: 10 }, steps: [{}] };
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

import {
  extractSymbolFromPrompt,
  isSafeSymbolResearchPrompt,
} from '../src/mastra/symbol-research';
import {
  MastraModeStrictFailureError,
  runMastraMode,
} from '../src/mastra/mode-runner';

const packet = {
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

const settings = { aiApiKeys: null, chatModel: null };
const env = { AI_DEFAULT_MODEL: 'google/gemini-3.6-flash' } as never;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.failRisk = false;
  mocks.rateLimitFailures = 0;
  mocks.resolveChatModel.mockReturnValue({
    model: {},
    modelId: 'google/gemini-3.6-flash',
    providerId: 'google',
  });
  mocks.collectSymbolResearchPacket.mockResolvedValue(packet);
});

describe('generalized Mastra symbol routing', () => {
  it('extracts one canonical symbol and rejects mixed or mutating prompts', () => {
    expect(extractSymbolFromPrompt('Analyse EURUSD 1H')).toBe('EURUSD');
    expect(extractSymbolFromPrompt('Analyse gold')).toBe('XAUUSD');
    expect(extractSymbolFromPrompt('Compare EURUSD and GBPUSD')).toBeNull();
    expect(extractSymbolFromPrompt('Analyse my default market', 'BTCUSDT')).toBe('BTCUSDT');
    expect(isSafeSymbolResearchPrompt('Analyse EURUSD')).toBe(true);
    expect(isSafeSymbolResearchPrompt('Buy EURUSD now')).toBe(false);
  });
});

describe('Mastra mode runner', () => {
  it('runs Quick with one specialist over one shared packet', async () => {
    const result = await runMastraMode({
      prompt: 'Give me a quick technical read on EURUSD',
      symbol: 'EURUSD',
      userId: 'user-1',
      threadId: 'thread-1',
      runId: 'run-quick',
      mode: 'quick',
      settings,
      env,
    });

    expect(result).toMatchObject({ mode: 'quick', symbol: 'EURUSD', finalText: expect.stringContaining('EURUSD') });
    expect(result.agentOpinions).toHaveLength(1);
    expect(result.agentOpinions[0]?.agentName).toBe('technical');
    expect(mocks.collectSymbolResearchPacket).toHaveBeenCalledWith('EURUSD', undefined);
  });

  it('runs Standard with technical/fundamental specialists and fusion', async () => {
    const result = await runMastraMode({
      prompt: 'Analyze EURUSD structure and macro context',
      symbol: 'EURUSD',
      userId: 'user-1',
      threadId: 'thread-1',
      runId: 'run-standard',
      mode: 'standard',
      settings,
      env,
    });

    expect(result.finalText).toBe('Synthesized read.');
    expect(result.agentOpinions.map((opinion) => opinion.agentName).sort()).toEqual(['fundamental', 'technical']);
    expect(result.stats.inputTokens).toBe(40);
    expect(result.totalCostUsd).toBeGreaterThanOrEqual(0);
  });

  it('keeps Full strict when a required specialist fails', async () => {
    mocks.failRisk = true;
    await expect(runMastraMode({
      prompt: 'Run a full committee analysis of EURUSD',
      symbol: 'EURUSD',
      userId: 'user-1',
      threadId: 'thread-1',
      runId: 'run-full',
      mode: 'full',
      settings,
      env,
    })).rejects.toBeInstanceOf(MastraModeStrictFailureError);
  });

  it('retries a transient specialist rate-limit and completes Full', async () => {
    // One specialist hits a momentary 429 quota error; the retry absorbs it.
    mocks.rateLimitFailures = 1;
    const result = await runMastraMode({
      prompt: 'Run a full committee analysis of EURUSD',
      symbol: 'EURUSD',
      userId: 'user-1',
      threadId: 'thread-1',
      runId: 'run-full-retry',
      mode: 'full',
      settings,
      env,
    });

    expect(result.finalText).toBe('Synthesized read.');
    expect(result.agentOpinions).toHaveLength(4);
  });
});
