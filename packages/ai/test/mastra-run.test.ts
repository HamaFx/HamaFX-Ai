import type { LanguageModel } from 'ai';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  resolveChatModel: vi.fn(),
  createXauusdMastraAgent: vi.fn(),
  collectXauusdResearchPacket: vi.fn(),
  requireVerifiedXauusdReport: vi.fn(),
  beginMastraRun: vi.fn(),
  finishMastraRun: vi.fn().mockResolvedValue(undefined),
  getMastraGenerationStats: vi.fn(() => ({ inputTokens: 4, outputTokens: 6, toolCalls: 1, steps: 2 })),
  mastraOutcomeForError: vi.fn(() => 'failed'),
  getDiagnosticContext: vi.fn(() => ({ traceId: 'trace-1' })),
  withDiagnostics: vi.fn(async (_userId: string, _threadId: string, fn: () => Promise<unknown>) => fn()),
}));

vi.mock('../src/model', () => ({
  resolveChatModel: mocks.resolveChatModel,
}));
vi.mock('../src/mastra/agent', () => ({
  createXauusdMastraAgent: mocks.createXauusdMastraAgent,
}));
vi.mock('../src/mastra/research-packet', () => ({
  collectXauusdResearchPacket: mocks.collectXauusdResearchPacket,
}));
vi.mock('../src/mastra/report-verifier', () => ({
  requireVerifiedXauusdReport: mocks.requireVerifiedXauusdReport,
}));
vi.mock('../src/mastra/telemetry', () => ({
  beginMastraRun: mocks.beginMastraRun,
  finishMastraRun: mocks.finishMastraRun,
  getMastraGenerationStats: mocks.getMastraGenerationStats,
  mastraOutcomeForError: mocks.mastraOutcomeForError,
  MASTRA_XAUUSD_AGENT_ID: 'kestrel-xauusd-research-poc',
  MASTRA_XAUUSD_AGENT_VERSION: 'poc-1',
}));
vi.mock('../src/diagnostics', () => ({
  getDiagnosticContext: mocks.getDiagnosticContext,
  withDiagnostics: mocks.withDiagnostics,
}));

import {
  resolveXauusdMastraModel,
  runXauusdMastra,
} from '../src/mastra/run';

const model = {} as LanguageModel;
const settings = { aiApiKeys: null, chatModel: null };
const env = {} as Parameters<typeof resolveXauusdMastraModel>[1];

describe('Mastra BYOK runner', () => {
  beforeEach(() => {
    mocks.resolveChatModel.mockReset();
    mocks.createXauusdMastraAgent.mockReset();
    mocks.collectXauusdResearchPacket.mockReset().mockResolvedValue({
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
      missingData: [],
      warnings: [],
    });
    mocks.requireVerifiedXauusdReport.mockReset().mockReturnValue({
      symbol: 'XAUUSD',
      asOf: new Date().toISOString(),
      dataQuality: 'complete',
      bias: 'neutral',
      confidence: 0.5,
      regime: 'range',
      bottomLine: 'Test report',
      technicalSummary: 'Test technical summary',
      fundamentalSummary: 'Unavailable in POC',
      scenarios: [
        { name: 'Bullish', direction: 'bullish', trigger: 'breakout', invalidation: 'below level', targets: [], risks: ['volatility'], evidenceIds: ['packet-1'] },
        { name: 'Bearish', direction: 'bearish', trigger: 'breakdown', invalidation: 'above level', targets: [], risks: ['volatility'], evidenceIds: ['packet-1'] },
      ],
      contradictions: [],
      missingData: [],
      evidenceIds: ['packet-1'],
      sources: [{ evidenceId: 'packet-1', source: 'fixture', dataAsOf: new Date().toISOString() }],
    });
    mocks.beginMastraRun.mockReset();
    mocks.finishMastraRun.mockReset().mockResolvedValue(undefined);
    mocks.getMastraGenerationStats.mockReset().mockReturnValue({ inputTokens: 4, outputTokens: 6, toolCalls: 1, steps: 2 });
    mocks.mastraOutcomeForError.mockReset().mockReturnValue('failed');
    mocks.getDiagnosticContext.mockReturnValue({ traceId: 'trace-1' });
    mocks.resolveChatModel.mockReturnValue({
      model,
      modelId: 'google/gemini-2.5-flash',
      providerId: 'google',
      bareModelId: 'gemini-2.5-flash',
    });
  });

  it('uses the same Kestrel resolver and technical tier', () => {
    const resolved = resolveXauusdMastraModel(settings, env);

    expect(resolved.model).toBe(model);
    expect(mocks.resolveChatModel).toHaveBeenCalledWith(settings, env, 'technical');
  });

  it('injects the resolved model and authenticated request context into Mastra', async () => {
    const generate = vi.fn().mockResolvedValue({ text: 'grounded result', object: {} });
    mocks.createXauusdMastraAgent.mockReturnValue({ generate });

    const result = await runXauusdMastra({
      prompt: 'Analyse gold',
      userId: 'user-1',
      threadId: 'thread-1',
      runId: 'run-1',
      settings,
      env,
    });

    expect(result).toMatchObject({
      modelId: 'google/gemini-2.5-flash',
      providerId: 'google',
      stats: { inputTokens: 4, outputTokens: 6, toolCalls: 1, steps: 2 },
    });
    expect(mocks.createXauusdMastraAgent).toHaveBeenCalledWith({ model });
    expect(generate).toHaveBeenCalledWith(
      'Analyse gold',
      expect.objectContaining({
        requestContext: expect.objectContaining({
          get: expect.any(Function),
        }),
        toolChoice: 'none',
        structuredOutput: expect.objectContaining({ schema: expect.anything() }),
      }),
    );
    const options = generate.mock.calls[0]![1] as { requestContext: { get: (key: string) => unknown } };
    expect(options.requestContext.get('userId')).toBe('user-1');
    expect(options.requestContext.get('threadId')).toBe('thread-1');
    expect(options.requestContext.get('runId')).toBe('run-1');
    expect(mocks.finishMastraRun).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-1',
      threadId: 'thread-1',
      runId: 'run-1',
      model: 'google/gemini-2.5-flash',
      outcome: 'success',
    }));
  });

  it('preserves generation failures and records a failed terminal outcome', async () => {
    const error = new Error('provider unavailable');
    mocks.createXauusdMastraAgent.mockReturnValue({
      generate: vi.fn().mockRejectedValue(error),
    });

    await expect(runXauusdMastra({
      prompt: 'Analyse gold',
      userId: 'user-1',
      threadId: 'thread-1',
      runId: 'run-2',
      settings,
      env,
    })).rejects.toBe(error);

    expect(mocks.mastraOutcomeForError).toHaveBeenCalledWith(error, undefined);
    expect(mocks.finishMastraRun).toHaveBeenCalledWith(expect.objectContaining({
      runId: 'run-2',
      outcome: 'failed',
      error,
    }));
  });
});
