// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUserWithSettings: vi.fn(),
  reserveTurnBudget: vi.fn(),
  estimateCostUsd: vi.fn(),
  getServerEnv: vi.fn(),
  runChat: vi.fn(),
  consumeUIMessageStream: vi.fn(),
  runMastraXauusdResearch: vi.fn(),
  metrics: { increment: vi.fn(), observe: vi.fn() },
}));

vi.mock('@kestrel/ai', () => ({
  DEFAULT_MAX_DAILY_USD: 5,
  estimateCostUsd: mocks.estimateCostUsd,
  reserveTurnBudget: mocks.reserveTurnBudget,
  runChat: mocks.runChat,
  consumeUIMessageStream: mocks.consumeUIMessageStream,
}));
vi.mock('@kestrel/db', () => ({
  getUserWithSettings: mocks.getUserWithSettings,
}));
vi.mock('@kestrel/shared', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@kestrel/shared')>()),
  metrics: mocks.metrics,
}));
vi.mock('@kestrel/ai/agent', () => ({ runChat: mocks.runChat }));
vi.mock('@kestrel/shared/logger', () => ({
  createCategorizedLogger: () => ({ info: vi.fn(), warn: vi.fn() }),
}));
vi.mock('@/lib/env', () => ({ getServerEnv: mocks.getServerEnv }));
vi.mock('@/lib/services/mastra-xauusd', () => ({
  runMastraXauusdResearch: mocks.runMastraXauusdResearch,
}));

import {
  compareMastraShadowTexts,
  runMastraShadowComparison,
} from '@/lib/services/mastra-shadow-comparison';

function budgetHandle() {
  return {
    reconcile: vi.fn().mockResolvedValue(undefined),
    release: vi.fn().mockResolvedValue(undefined),
  };
}

describe('Mastra shadow comparison', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUserWithSettings.mockResolvedValue({ settings: { maxDailyUsd: 5 } });
    mocks.getServerEnv.mockReturnValue({ MAX_DAILY_USD: 5 });
    mocks.estimateCostUsd.mockReturnValue(0.003);
    mocks.runMastraXauusdResearch.mockResolvedValue({
      runId: 'shadow-run-1',
      modelId: 'mistral-small-latest',
      providerId: 'mistral',
      stats: { inputTokens: 100, outputTokens: 50 },
      result: { text: 'Gold XAUUSD bullish trend with risk around support.' },
      report: {
        bias: 'bullish',
        dataQuality: 'partial',
      },
    });
  });

  it('records aggregate overlap without retaining either response text', () => {
    const result = compareMastraShadowTexts(
      'Gold is bullish near support with elevated risk.',
      'XAUUSD bullish trend with risk around support.',
      { bias: 'bullish', dataQuality: 'partial' },
    );

    expect(result).toMatchObject({
      overlap: 'high',
      mastraVerified: true,
      mastraBias: 'bullish',
      mastraDataQuality: 'partial',
    });
    expect(result).not.toHaveProperty('legacyText');
    expect(result).not.toHaveProperty('mastraText');
  });

  it('uses the shared budget and records a successful shadow run', async () => {
    const budget = budgetHandle();
    mocks.reserveTurnBudget.mockResolvedValue(budget);

    const result = await runMastraShadowComparison({
      userId: 'user-1',
      threadId: 'thread-1',
      prompt: 'Analyse XAUUSD',
      legacyText: 'Gold is bullish near support.',
    });

    expect(result).not.toBeNull();
    expect(mocks.reserveTurnBudget).toHaveBeenCalledWith({ userId: 'user-1', maxDailyUsd: 5 });
    expect(mocks.runMastraXauusdResearch).toHaveBeenCalledWith(expect.objectContaining({
      runId: expect.stringMatching(/^shadow-/),
      telemetryKind: 'mastra_xauusd_shadow',
    }));
    expect(budget.reconcile).toHaveBeenCalledWith(0.003);
    expect(budget.release).not.toHaveBeenCalled();
    expect(mocks.metrics.increment).toHaveBeenCalledWith('mastra_shadow_total', expect.objectContaining({
      tags: expect.objectContaining({ outcome: 'completed' }),
    }));
  });

  it('runs the legacy comparison without persisting a second message', async () => {
    mocks.runChat.mockResolvedValue({
      toUIMessageStreamResponse: () => new Response('legacy-stream'),
    });
    mocks.consumeUIMessageStream.mockResolvedValue({
      text: 'Legacy gold analysis',
      errors: [],
    });

    const { runLegacyShadowComparison } = await import('@/lib/services/mastra-shadow-comparison');
    const result = await runLegacyShadowComparison({
      userId: 'user-1',
      threadId: 'thread-1',
      prompt: 'Analyse XAUUSD',
      userMessage: {
        id: 'message-1',
        role: 'user',
        parts: [{ type: 'text', text: 'Analyse XAUUSD' }],
      },
      mastraText: 'Mastra gold analysis',
      report: null,
    });

    expect(result).not.toBeNull();
    expect(mocks.runChat).toHaveBeenCalledWith(expect.objectContaining({
      persistMessages: false,
      telemetryKind: 'legacy_shadow',
      excludeMessageIdempotencyKeys: ['mastra:thread-1:message-1:assistant'],
      threadId: 'thread-1',
    }));
  });

  it('isolates provider failures and releases the shadow reservation', async () => {
    const budget = budgetHandle();
    mocks.reserveTurnBudget.mockResolvedValue(budget);
    mocks.runMastraXauusdResearch.mockRejectedValue(new Error('provider unavailable'));

    const result = await runMastraShadowComparison({
      userId: 'user-1',
      threadId: 'thread-1',
      prompt: 'Analyse XAUUSD',
      legacyText: 'legacy answer',
    });

    expect(result).toBeNull();
    expect(budget.release).toHaveBeenCalledOnce();
    expect(mocks.metrics.increment).toHaveBeenCalledWith('mastra_shadow_failed_total', expect.objectContaining({
      tags: { reason: 'run' },
    }));
  });
});
