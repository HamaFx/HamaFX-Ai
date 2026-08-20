// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { runMastraCanonicalChatService } from '@/lib/services/mastra-canonical-chat';

const mocks = vi.hoisted(() => ({
  appendAssistantMessage: vi.fn(),
  appendUserMessage: vi.fn(),
  estimateCostUsd: vi.fn(),
  listMessages: vi.fn(),
  reserveTurnBudget: vi.fn(),
  getUserWithSettings: vi.fn(),
  getServerEnv: vi.fn(),
  runMastraCanonicalChat: vi.fn(),
}));

vi.mock('@kestrel/ai', () => ({
  DEFAULT_MAX_DAILY_USD: 5,
  appendAssistantMessage: mocks.appendAssistantMessage,
  appendUserMessage: mocks.appendUserMessage,
  estimateCostUsd: mocks.estimateCostUsd,
  listMessages: mocks.listMessages,
  reserveTurnBudget: mocks.reserveTurnBudget,
}));
vi.mock('@kestrel/db', () => ({
  getUserWithSettings: mocks.getUserWithSettings,
}));
vi.mock('@/lib/env', () => ({
  getServerEnv: mocks.getServerEnv,
}));
vi.mock('@kestrel/ai/mastra', () => ({
  runMastraCanonicalChat: mocks.runMastraCanonicalChat,
}));

const input = {
  userId: 'user-1',
  threadId: '550e8400-e29b-41d4-a716-446655440000',
  userMessage: {
    id: 'ui-message-1',
    role: 'user' as const,
    parts: [{ type: 'text' as const, text: 'Explain RSI' }],
  },
};

describe('canonical Mastra chat service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUserWithSettings.mockResolvedValue({
      settings: {
        aiApiKeys: null,
        chatModel: null,
        maxDailyUsd: 5,
      },
    });
    mocks.getServerEnv.mockReturnValue({ MAX_DAILY_USD: 5, MAX_TOOL_ITERATIONS: 6 });
    mocks.reserveTurnBudget.mockResolvedValue({
      reconcile: vi.fn().mockResolvedValue(undefined),
      release: vi.fn().mockResolvedValue(undefined),
    });
    mocks.listMessages.mockResolvedValue([]);
    mocks.estimateCostUsd.mockReturnValue(0.001);
    mocks.runMastraCanonicalChat.mockResolvedValue({
      text: 'RSI explanation',
      modelId: 'google/gemini-3.6-flash',
      providerId: 'google',
      routing: { domain: 'technical', reason: 'keyword' },
      stats: { inputTokens: 10, outputTokens: 5, toolCalls: 0, steps: 1 },
      totalCostUsd: 0.001,
      totalLatencyMs: 20,
      toolNames: [],
    });
    mocks.appendAssistantMessage.mockResolvedValue({ messageId: 'assistant-1' });
  });

  it('uses ui:<message-id> so legacy fallback cannot duplicate the user turn', async () => {
    await runMastraCanonicalChatService(input);

    expect(mocks.appendUserMessage).toHaveBeenCalledWith(
      input.userId,
      input.threadId,
      input.userMessage,
    );
    expect(mocks.appendUserMessage.mock.calls[0]).toHaveLength(3);
  });
});
