import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

// Mock dependencies
vi.mock('ai', () => ({
  generateText: vi.fn(),
}));

vi.mock('../src/model', () => ({
  resolveModel: vi.fn(() => 'mock-model'),
}));

vi.mock('../src/tool-context', () => ({
  maybeGetToolContext: vi.fn(() => null),
}));

vi.mock('../src/telemetry', () => ({
  telemetryConfig: vi.fn(() => ({})),
}));

vi.mock('../src/db', () => ({
  getDb: vi.fn(() => ({
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn(() => Promise.resolve([{ id: 'plan-msg-1' }])),
      })),
    })),
  })),
}));

vi.mock('@hamafx/db', () => ({
  schema: {
    chatMessages: {},
  },
}));

import { runPlanner, type RunPlannerArgs } from '../src/planner';
import { generateText } from 'ai';
import { maybeGetToolContext } from '../src/tool-context';
import type { UIMessage } from 'ai';

function makeUserMsg(text: string): UIMessage {
  return {
    id: 'msg-1',
    role: 'user',
    parts: [{ type: 'text', text }],
  };
}

function makePlannerArgs(overrides: Partial<RunPlannerArgs> = {}): RunPlannerArgs {
  return {
    threadId: 'thread-1',
    userMessage: makeUserMsg('What is the RSI on EURUSD?'),
    routing: {
      domain: 'technical',
      planRequired: true,
      rationale: 'Technical analysis question',
    },
    plannerModelId: 'google/gemini-2.5-flash',
    env: {
      AI_GATEWAY_API_KEY: undefined,
      GOOGLE_GENERATIVE_AI_API_KEY: 'fake-key',
      GOOGLE_VERTEX_PROJECT: undefined,
      GOOGLE_VERTEX_LOCATION: undefined,
      GOOGLE_APPLICATION_CREDENTIALS_JSON: undefined,
      GOOGLE_APPLICATION_CREDENTIALS: undefined,
      AI_DEFAULT_MODEL: 'google/gemini-2.5-flash',
      MAX_DAILY_USD: 5,
      LOG_PROMPTS: false,
    } as never,
    ...overrides,
  };
}

describe('runPlanner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('skips plan when planRequired is false', async () => {
    const args = makePlannerArgs({
      routing: { domain: 'technical', planRequired: false, rationale: 'Test' },
    });

    const result = await runPlanner(args);
    expect(result.source).toBe('fallback');
    expect(result.reason).toBe('not_required');
    expect(result.messageId).toBeNull();
    expect(result.ms).toBe(0);
  });

  it('returns a deterministic plan for technical domain', async () => {
    // Set budget exceeded so planner takes the budget → deterministic path
    vi.mocked(maybeGetToolContext).mockReturnValueOnce({
      userId: 'user-1',
      budget: { spent: 10, max: 5 },
    } as never);

    const args = makePlannerArgs();
    const result = await runPlanner(args);

    expect(result.source).toBe('fallback');
    expect(result.reason).toBe('budget');
    expect(result.plan.domain).toBe('technical');
    expect(result.plan.steps.length).toBeGreaterThan(0);
    expect(result.messageId).toBeTypeOf('string');
  });

  it('returns a deterministic plan for fundamental domain via budget route', async () => {
    // Set budget exceeded so planner takes the budget → deterministic path
    vi.mocked(maybeGetToolContext).mockReturnValueOnce({
      userId: 'user-1',
      budget: { spent: 10, max: 5 },
    } as never);

    const args = makePlannerArgs({
      routing: { domain: 'fundamental', planRequired: true, rationale: 'Fundamental analysis' },
    });

    const result = await runPlanner(args);
    expect(result.source).toBe('fallback');
    expect(result.reason).toBe('budget');
    expect(result.plan.domain).toBe('fundamental');
    expect(result.plan.steps.some((s) => s.includes('events'))).toBe(true);
  });

  it('uses deterministic plan for generic domain via budget route', async () => {
    // Set budget exceeded so planner takes the budget → deterministic path
    vi.mocked(maybeGetToolContext).mockReturnValueOnce({
      userId: 'user-1',
      budget: { spent: 10, max: 5 },
    } as never);

    const args = makePlannerArgs({
      routing: { domain: 'generic', planRequired: true, rationale: 'General' },
    });

    const result = await runPlanner(args);
    expect(result.source).toBe('fallback');
    expect(result.plan.domain).toBe('generic');
  });

  it('returns LLM-generated plan on successful generateText', async () => {
    // Set up tool context to pass budget check
    vi.mocked(maybeGetToolContext).mockReturnValueOnce({
      userId: 'user-1',
      budget: { spent: 0.5, max: 10 },
    } as never);

    vi.mocked(generateText).mockResolvedValueOnce({
      text: '{"steps":["Pull candles for EURUSD 1h","Compute RSI"],"expectedTools":["get_candles","get_indicators"],"rationale":"User asked about RSI; need candles and indicator data"}',
      usage: { inputTokens: 50, outputTokens: 30 },
    } as never);

    const result = await runPlanner(makePlannerArgs());
    expect(result.source).toBe('llm');
    expect(result.plan.steps).toHaveLength(2);
    expect(result.plan.expectedTools).toContain('get_candles');
    expect(result.inputTokens).toBe(50);
    expect(result.outputTokens).toBe(30);
    expect(result.messageId).toBe('plan-msg-1');
  });

  it('falls back when LLM returns unparseable JSON', async () => {
    vi.mocked(maybeGetToolContext).mockReturnValueOnce({
      userId: 'user-1',
      budget: { spent: 0.5, max: 10 },
    } as never);

    vi.mocked(generateText).mockResolvedValueOnce({
      text: 'not json at all',
      usage: { inputTokens: 10, outputTokens: 5 },
    } as never);

    const result = await runPlanner(makePlannerArgs());
    expect(result.source).toBe('fallback');
    expect(result.reason).toBe('failed');
    expect(result.plan.steps.length).toBeGreaterThan(0); // deterministic fallback
  });

  it('falls back when LLM throws an error', async () => {
    vi.mocked(maybeGetToolContext).mockReturnValueOnce({
      userId: 'user-1',
      budget: { spent: 0.5, max: 10 },
    } as never);

    vi.mocked(generateText).mockRejectedValueOnce(new Error('API error'));

    const result = await runPlanner(makePlannerArgs());
    expect(result.source).toBe('fallback');
    expect(result.reason).toBe('failed');
    expect(result.plan.steps.length).toBeGreaterThan(0);
  });

  it('handles JSON with markdown fences', async () => {
    vi.mocked(maybeGetToolContext).mockReturnValueOnce({
      userId: 'user-1',
      budget: { spent: 0.5, max: 10 },
    } as never);

    vi.mocked(generateText).mockResolvedValueOnce({
      text: '```json\n{"steps":["Analyze chart"],"expectedTools":["analyze_chart_image"],"rationale":"User wants chart analysis"}\n```',
      usage: { inputTokens: 20, outputTokens: 10 },
    } as never);

    const result = await runPlanner(makePlannerArgs());
    expect(result.source).toBe('llm');
    expect(result.plan.steps[0]).toContain('chart');
  });

  it('uses deterministic plan for generic domain via budget route', async () => {
    const args = makePlannerArgs({
      routing: { domain: 'generic', planRequired: true, rationale: 'General' },
    });

    const result = await runPlanner(args);
    expect(result.source).toBe('fallback');
    expect(result.plan.domain).toBe('generic');
  });
});
