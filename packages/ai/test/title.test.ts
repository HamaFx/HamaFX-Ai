import { describe, expect, it, vi, beforeEach } from 'vitest';

// Mock dependencies for generateTitle
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

import { deterministicFallbackTitle, generateTitle, type GenerateTitleArgs } from '../src/title';
import { generateText } from 'ai';

describe('deterministicFallbackTitle', () => {
  it('returns short messages unchanged', () => {
    expect(deterministicFallbackTitle('Hello')).toBe('Hello');
  });

  it('trims leading and trailing whitespace', () => {
    expect(deterministicFallbackTitle('  Hello World  ')).toBe('Hello World');
  });

  it('truncates to 60 codepoints with ellipsis', () => {
    const long = 'a'.repeat(100);
    const result = deterministicFallbackTitle(long);
    expect(result).toHaveLength(61); // 60 chars + ellipsis
    expect(result.endsWith('…')).toBe(true);
  });

  it('handles multi-codepoint characters correctly', () => {
    // Emoji is multiple codepoints
    const emoji = '😀'.repeat(30); // 30 emoji = 60 codepoints
    expect(deterministicFallbackTitle(emoji)).toHaveLength(60); // exactly 60 codepoints
  });

  it('returns empty string for whitespace-only input', () => {
    expect(deterministicFallbackTitle('   ')).toBe('');
  });
});

describe('generateTitle', () => {
  const baseArgs: GenerateTitleArgs = {
    threadId: 'thread-1',
    firstUser: 'What is the RSI on EURUSD?',
    firstAssistant: 'Based on my analysis, the RSI on EURUSD 1h is 45.',
    titleModelId: 'google/gemini-2.5-flash',
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
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('falls back on empty LLM response', async () => {
    vi.mocked(generateText).mockResolvedValueOnce({
      text: '',
      usage: { inputTokens: 10, outputTokens: 5 },
    } as never);

    const result = await generateTitle(baseArgs);
    expect(result.source).toBe('fallback');
    expect(result.reason).toBe('empty');
    expect(result.title.length).toBeGreaterThan(0);
  });

  it('returns LLM-generated title on success', async () => {
    vi.mocked(generateText).mockResolvedValueOnce({
      text: 'EURUSD RSI Analysis',
      usage: { inputTokens: 10, outputTokens: 3 },
    } as never);

    const result = await generateTitle(baseArgs);
    expect(result.source).toBe('llm');
    expect(result.title).toBe('EURUSD RSI Analysis');
    expect(result.inputTokens).toBe(10);
    expect(result.outputTokens).toBe(3);
  });

  it('strips surrounding quotes from LLM output', async () => {
    vi.mocked(generateText).mockResolvedValueOnce({
      text: '"EURUSD RSI Analysis"',
      usage: { inputTokens: 10, outputTokens: 3 },
    } as never);

    const result = await generateTitle(baseArgs);
    expect(result.title).toBe('EURUSD RSI Analysis');
  });

  it('falls back on LLM error', async () => {
    vi.mocked(generateText).mockRejectedValueOnce(new Error('API error'));

    const result = await generateTitle(baseArgs);
    expect(result.source).toBe('fallback');
    expect(result.reason).toBe('error');
    expect(result.title.length).toBeGreaterThan(0);
  });

  it('handles signal propagation', async () => {
    const ac = new AbortController();
    vi.mocked(generateText).mockRejectedValueOnce(new DOMException('Aborted', 'AbortError'));

    const result = await generateTitle({ ...baseArgs, signal: ac.signal });
    expect(result.source).toBe('fallback');
    expect(result.reason).toBe('error');
  });
});
