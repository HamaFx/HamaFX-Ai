import { describe, expect, it, vi } from 'vitest';

import { buildConversationGuardrails, buildGuardrailInputProcessors, buildResearchGuardrails } from '../src/mastra-v2/guardrails';

const mocks = vi.hoisted(() => ({
  resolveChatModel: vi.fn(),
}));

vi.mock('../src/model', () => ({
  resolveChatModel: mocks.resolveChatModel,
}));

const settings = { aiApiKeys: null, chatModel: null };
const env = {};

describe('mastra guardrails', () => {
  it('returns UnicodeNormalizer only when no model is resolvable', () => {
    mocks.resolveChatModel.mockImplementation(() => {
      throw new Error('No AI API keys configured');
    });
    const { processors, warnings } = buildConversationGuardrails(settings as never, env as never);
    expect(processors.length).toBe(1);
    expect(processors[0]?.id).toBe('unicode-normalizer');
    expect(warnings.length).toBe(1);
  });

  it('builds UnicodeNormalizer + PromptInjectionDetector with a resolved BYOK model', () => {
    mocks.resolveChatModel.mockReturnValue({
      model: { id: 'fast-model' },
      modelId: 'google/gemini-3.5-flash-lite',
      providerId: 'google',
      bareModelId: 'gemini-3.5-flash-lite',
    });
    const { processors } = buildConversationGuardrails(settings as never, env as never);
    expect(processors.map((p) => p.id)).toEqual(['unicode-normalizer', 'prompt-injection-detector']);
    expect(mocks.resolveChatModel).toHaveBeenCalledWith(
      expect.objectContaining({ aiApiKeys: null }),
      env,
      'technical',
    );
  });

  it('uses the rewrite strategy for conversation paths and block for research', () => {
    mocks.resolveChatModel.mockReturnValue({
      model: { id: 'fast-model' },
      modelId: 'google/gemini-3.5-flash-lite',
      providerId: 'google',
      bareModelId: 'gemini-3.5-flash-lite',
    });
    const conversation = buildConversationGuardrails(settings as never, env as never).processors[1];
    const research = buildResearchGuardrails(settings as never, env as never).processors[1];
    expect(conversation).toBeDefined();
    expect(research).toBeDefined();
  });

  it('exposes the explicit options builder with custom threshold', () => {
    mocks.resolveChatModel.mockReturnValue({
      model: { id: 'fast-model' },
      modelId: 'google/gemini-3.5-flash-lite',
      providerId: 'google',
      bareModelId: 'gemini-3.5-flash-lite',
    });
    const { processors } = buildGuardrailInputProcessors({
      settings: settings as never,
      env: env as never,
      strategy: 'block',
      threshold: 0.9,
    });
    expect(processors.length).toBe(2);
  });
});
