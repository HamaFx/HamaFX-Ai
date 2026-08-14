import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  resolveChatModel: vi.fn(),
  resolveModelForProvider: vi.fn(),
  decryptByok: vi.fn(),
  pickNextFallbackProvider: vi.fn(),
  checkBudgetAlertsAndThresholds: vi.fn(),
  classifyStreamError: vi.fn(),
}));

vi.mock('../../src/model', () => ({
  resolveChatModel: mocks.resolveChatModel,
  resolveModelForProvider: mocks.resolveModelForProvider,
  TIER_TO_DOMAIN: { summary: 'summary', technical: 'technical', fundamental: 'fundamental' },
}));
vi.mock('@kestrel/shared/encryption', () => ({ decryptByok: mocks.decryptByok }));
vi.mock('../../src/model-resolution', () => ({ pickNextFallbackProvider: mocks.pickNextFallbackProvider }));
vi.mock('../../src/cost', () => ({ checkBudgetAlertsAndThresholds: mocks.checkBudgetAlertsAndThresholds }));
vi.mock('../../src/fallback', () => ({ classifyStreamError: mocks.classifyStreamError }));

import { withAgentModelFallback } from '../../src/multi-agent/agents/agent-model';

function resolution(providerId: string, modelId: string) {
  return { model: { providerId, modelId }, modelId: `${providerId}/${modelId}`, providerId, bareModelId: modelId };
}

function context(signal: AbortSignal | null = null) {
  return {
    userId: 'user-1',
    threadId: 'thread-1',
    symbol: 'XAUUSD',
    snapshot: {} as never,
    userMessage: { id: 'message-1', role: 'user', parts: [{ type: 'text', text: 'analyze gold' }] },
    history: [],
    userSettings: {
      aiApiKeys: { google: 'google-key', openai: 'openai-key' },
      chatModel: 'google:gemini-fast',
      aiFallbackChain: ['google', 'openai'],
      disabledTools: [],
      language: 'en',
      maxDailyUsd: 10,
    },
    env: { GOOGLE_GENERATIVE_AI_API_KEY: 'google-key', MAX_DAILY_USD: 10, MAX_TOOL_ITERATIONS: 4 },
    signal,
  } as never;
}

describe('withAgentModelFallback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.decryptByok.mockReturnValue({ google: 'google-key', openai: 'openai-key' });
    mocks.resolveChatModel.mockReturnValue(resolution('google', 'gemini-fast'));
    mocks.resolveModelForProvider.mockImplementation((providerId: string, _settings: unknown, _env: unknown, modelId?: string) =>
      resolution(providerId, modelId ?? (providerId === 'openai' ? 'gpt-fast' : 'gemini-fast')),
    );
    mocks.pickNextFallbackProvider
      .mockReturnValueOnce({ providerId: 'openai', modelId: 'gpt-fast' })
      .mockReturnValueOnce(null);
    mocks.checkBudgetAlertsAndThresholds.mockResolvedValue({ blocked: false, nonEssentialDisabled: false });
  });

  it('moves to the next configured provider after a transient failure', async () => {
    mocks.classifyStreamError.mockReturnValue({ fallback: true, reason: 'rate-limit' });
    const execute = vi.fn()
      .mockRejectedValueOnce(Object.assign(new Error('rate limited'), { statusCode: 429 }))
      .mockResolvedValueOnce('fallback result');

    const result = await withAgentModelFallback(context(), 'technical', 'fast', execute);

    expect(result.result).toBe('fallback result');
    expect(result.resolution.providerId).toBe('openai');
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it('does not switch providers for a hard error', async () => {
    mocks.classifyStreamError.mockReturnValue({ fallback: false, reason: 'hard-error' });
    const execute = vi.fn().mockRejectedValue(new Error('invalid tool schema'));

    await expect(withAgentModelFallback(context(), 'technical', 'fast', execute)).rejects.toThrow('invalid tool schema');
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('does not execute a model after cancellation', async () => {
    const controller = new AbortController();
    controller.abort(new Error('client disconnected'));
    const execute = vi.fn();

    await expect(withAgentModelFallback(context(controller.signal), 'technical', 'fast', execute)).rejects.toThrow('client disconnected');
    expect(execute).not.toHaveBeenCalled();
  });
});
