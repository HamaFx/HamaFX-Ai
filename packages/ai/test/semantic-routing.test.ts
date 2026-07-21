import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

// Mock dependencies
vi.mock('ai', () => ({
  generateObject: vi.fn(),
}));

vi.mock('../src/model', () => ({
  resolveModel: vi.fn(() => ({
    // Return a mock LanguageModel-like object (not a string)
    modelId: 'mock-model',
    provider: 'mock-provider',
  })),
}));

import { classifyTurnLLM } from '../src/semantic-routing';
import { generateObject } from 'ai';
import { resolveModel } from '../src/model';

describe('classifyTurnLLM', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null when resolveModel returns a string (gateway mode)', async () => {
    vi.mocked(resolveModel).mockReturnValueOnce('gateway-model-string');

    const result = await classifyTurnLLM(
      'What is the RSI?',
      'google/gemini-2.5-flash',
      {},
      null,
    );
    expect(result).toBeNull();
    expect(generateObject).not.toHaveBeenCalled();
  });

  it('returns classification on successful API call with high confidence', async () => {
    vi.mocked(generateObject).mockResolvedValueOnce({
      object: {
        domain: 'technical',
        confidence: 0.95,
        rationale: 'User asked about RSI indicator',
      },
    } as never);

    const result = await classifyTurnLLM(
      'What is the RSI on EURUSD?',
      'google/gemini-2.5-flash',
      {},
      null,
    );
    expect(result).not.toBeNull();
    expect(result!.domain).toBe('technical');
    expect(result!.confidence).toBe(0.95);
  });

  it('returns null for low confidence classifications', async () => {
    vi.mocked(generateObject).mockResolvedValueOnce({
      object: {
        domain: 'fundamental',
        confidence: 0.3,
        rationale: 'Unclear question',
      },
    } as never);

    const result = await classifyTurnLLM(
      'Hello',
      'google/gemini-2.5-flash',
      {},
      null,
    );
    expect(result).toBeNull();
  });

  it('returns null on API error', async () => {
    vi.mocked(generateObject).mockRejectedValueOnce(new Error('API timeout'));

    const result = await classifyTurnLLM(
      'Test question',
      'google/gemini-2.5-flash',
      {},
      null,
    );
    expect(result).toBeNull();
  });

  it('returns cached result on repeated call with same input', async () => {
    vi.mocked(generateObject).mockResolvedValueOnce({
      object: {
        domain: 'technical',
        confidence: 0.95,
        rationale: 'RSI question',
      },
    } as never);

    // First call
    const first = await classifyTurnLLM(
      'What is the RSI?',
      'google/gemini-2.5-flash',
      {},
      null,
    );
    expect(first).not.toBeNull();

    // Second call should hit cache — generateObject should not be called again
    const second = await classifyTurnLLM(
      'What is the RSI?',
      'google/gemini-2.5-flash',
      {},
      null,
    );

    expect(second).not.toBeNull();
    expect(second!.domain).toBe('technical');
    // generateObject was only called once (first call)
    expect(generateObject).toHaveBeenCalledTimes(1);
  });

  it('handles fundamental domain classification', async () => {
    vi.mocked(generateObject).mockResolvedValueOnce({
      object: {
        domain: 'fundamental',
        confidence: 0.92,
        rationale: 'User asked about Fed policy impact on gold',
      },
    } as never);

    const result = await classifyTurnLLM(
      'Why is gold rallying after FOMC?',
      'google/gemini-2.5-flash',
      {},
      null,
    );
    expect(result!.domain).toBe('fundamental');
  });

  it('handles abort signal forwarding', async () => {
    const ac = new AbortController();
    vi.mocked(generateObject).mockRejectedValueOnce(new DOMException('Aborted'));

    const result = await classifyTurnLLM(
      'Test',
      'google/gemini-2.5-flash',
      {},
      ac.signal,
    );
    // Signal not aborted — this tests that the signal is passed through
    expect(result).toBeNull();
  });
});
