// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { runMastraXauusdChat } from '@/lib/services/mastra-chat';

const mocks = vi.hoisted(() => ({
  getUserWithSettings: vi.fn(),
  reserveTurnBudget: vi.fn(),
  appendUserMessage: vi.fn(),
  appendAssistantMessage: vi.fn(),
  estimateCostUsd: vi.fn(),
  getServerEnv: vi.fn(),
  runMastraXauusdResearch: vi.fn(),
  runMastraXauusdConversation: vi.fn(),
}));

vi.mock('@kestrel/ai', () => ({
  DEFAULT_MAX_DAILY_USD: 5,
  appendAssistantMessage: mocks.appendAssistantMessage,
  appendUserMessage: mocks.appendUserMessage,
  estimateCostUsd: mocks.estimateCostUsd,
  reserveTurnBudget: mocks.reserveTurnBudget,
}));
vi.mock('@kestrel/db', () => ({
  getUserWithSettings: mocks.getUserWithSettings,
}));
vi.mock('@/lib/env', () => ({
  getServerEnv: mocks.getServerEnv,
}));
vi.mock('@/lib/services/mastra-xauusd', () => ({
  runMastraXauusdResearch: mocks.runMastraXauusdResearch,
  runMastraXauusdConversation: mocks.runMastraXauusdConversation,
}));
// Best-effort title generation is fire-and-forget and not under test here.
vi.mock('@/lib/services/mastra-thread-title', () => ({
  maybeGenerateThreadTitle: vi.fn(async () => {}),
}));

const input = {
  userId: 'user-1',
  threadId: '550e8400-e29b-41d4-a716-446655440000',
  prompt: 'Analyse gold',
  userMessage: {
    id: 'user-message-1',
    role: 'user' as const,
    parts: [{ type: 'text' as const, text: 'Analyse gold' }],
  },
};

function budgetHandle() {
  return {
    reconcile: vi.fn().mockResolvedValue(undefined),
    release: vi.fn().mockResolvedValue(undefined),
  };
}

describe('Mastra chat service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUserWithSettings.mockResolvedValue({ settings: { maxDailyUsd: 5 } });
    mocks.getServerEnv.mockReturnValue({
      AI_DEFAULT_MODEL: 'mistral-small-latest',
      MAX_DAILY_USD: 5,
    });
    mocks.estimateCostUsd.mockReturnValue(0.002);
    mocks.runMastraXauusdConversation.mockResolvedValue({
      modelId: 'mistral-small-latest',
      providerId: 'mistral',
      stats: { inputTokens: 80, outputTokens: 40 },
      result: { text: 'Conversational gold explanation' },
      report: null,
      packet: { packetId: 'packet-conversation', status: 'ready', dataQuality: 'partial' },
    });
    mocks.runMastraXauusdResearch.mockResolvedValue({
      modelId: 'mistral-small-latest',
      providerId: 'mistral',
      stats: { inputTokens: 100, outputTokens: 50 },
      result: { text: 'grounded result' },
      report: null,
      packet: { packetId: 'packet-1', status: 'ready', dataQuality: 'partial' },
    });
    mocks.appendUserMessage.mockResolvedValue(undefined);
    mocks.appendAssistantMessage.mockResolvedValue({ messageId: 'assistant-1' });
  });

  it('uses the shared budget and persists both messages on success', async () => {
    const budget = budgetHandle();
    mocks.reserveTurnBudget.mockResolvedValue(budget);

    const result = await runMastraXauusdChat(input);

    expect(mocks.reserveTurnBudget).toHaveBeenCalledWith({ userId: 'user-1', maxDailyUsd: 5 });
    expect(mocks.appendUserMessage).toHaveBeenCalledWith(
      'user-1',
      input.threadId,
      input.userMessage,
    );
    expect(mocks.appendAssistantMessage).toHaveBeenCalledWith(
      'user-1',
      input.threadId,
      expect.objectContaining({ role: 'assistant' }),
      { idempotencyKey: `mastra:${input.threadId}:user-message-1:assistant` },
    );
    const assistant = mocks.appendAssistantMessage.mock.calls[0]?.[2] as {
      parts: Array<{ type: string; text?: string; data?: unknown }>;
    };
    expect(assistant.parts[0]).toEqual({ type: 'text', text: 'grounded result' });
    expect(assistant.parts[1]).toMatchObject({
      type: 'data-multi-agent-meta',
      data: { agent: 'mastra-xauusd' },
    });
    expect(budget.reconcile).toHaveBeenCalledWith(0.002);
    expect(budget.release).not.toHaveBeenCalled();
    expect(result.runId).toEqual(expect.any(String));
  });

  it('selects the conversational runner for ordinary Single-mode prompts', async () => {
    const budget = budgetHandle();
    mocks.reserveTurnBudget.mockResolvedValue(budget);

    const result = await runMastraXauusdChat({ ...input, kind: 'conversation' });

    expect(result.result.text).toBe('Conversational gold explanation');
    expect(mocks.runMastraXauusdConversation).toHaveBeenCalledOnce();
    expect(mocks.runMastraXauusdResearch).not.toHaveBeenCalled();
  });

  it('releases the reservation when Mastra fails before producing a run', async () => {
    const budget = budgetHandle();
    mocks.reserveTurnBudget.mockResolvedValue(budget);
    mocks.runMastraXauusdResearch.mockRejectedValue(new Error('provider unavailable'));

    await expect(runMastraXauusdChat(input)).rejects.toThrow('provider unavailable');

    expect(budget.release).toHaveBeenCalledOnce();
    expect(budget.reconcile).not.toHaveBeenCalled();
  });

  it('reconciles actual spend if assistant persistence fails after the model run', async () => {
    const budget = budgetHandle();
    mocks.reserveTurnBudget.mockResolvedValue(budget);
    mocks.appendAssistantMessage.mockRejectedValue(new Error('database unavailable'));

    await expect(runMastraXauusdChat(input)).rejects.toThrow('database unavailable');

    expect(budget.reconcile).toHaveBeenCalledWith(0.002);
    expect(budget.release).not.toHaveBeenCalled();
  });
});
