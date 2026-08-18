import type { LanguageModel } from 'ai';
import { describe, expect, it } from 'vitest';

import {
  XAUUSD,
  XauusdRequestContextSchema,
  createEvidenceId,
  createXauusdMastraAgent,
  freshnessFromAge,
  qualityFromWarnings,
  requireXauusdUserContext,
} from '../src/mastra';

describe('Mastra XAUUSD proof of concept', () => {
  it('restricts the request context to an authenticated user and run', () => {
    expect(XauusdRequestContextSchema.parse({ userId: 'user-1', runId: 'run-1' })).toEqual({
      userId: 'user-1',
      runId: 'run-1',
    });

    expect(() => XauusdRequestContextSchema.parse({ userId: '', runId: 'run-1' })).toThrow();
    expect(() => XauusdRequestContextSchema.parse({ userId: 'user-1', runId: '' })).toThrow();
  });

  it('creates an isolated agent with only read-only XAUUSD tools', async () => {
    const agent = createXauusdMastraAgent({ model: {} as LanguageModel });
    const tools = await agent.listTools();

    expect(agent.id).toBe('kestrel-xauusd-research-poc');
    expect(Object.keys(tools)).toEqual([
      'getXauusdResearchPacket',
      'getXauusdPrice',
      'getXauusdCandles',
      'getXauusdIndicators',
    ]);
  });

  it('fails closed when a tool has no authenticated request context', () => {
    expect(() => requireXauusdUserContext({})).toThrow(/userId/);
    expect(() => requireXauusdUserContext({ requestContext: { get: () => undefined } })).toThrow(/userId/);
    expect(() => requireXauusdUserContext({
      requestContext: { get: (key) => key === 'userId' ? 'user-1' : undefined },
    })).toThrow(/runId/);
  });

  it('creates scoped evidence IDs and classifies freshness', () => {
    const evidenceId = createEvidenceId('price', XAUUSD);
    expect(evidenceId).toMatch(/^kestrel-price-xauusd-/);
    expect(freshnessFromAge(5_000, 10_000)).toBe('fresh');
    expect(freshnessFromAge(11_000, 10_000)).toBe('stale');
    expect(freshnessFromAge(null, 10_000)).toBe('unknown');
  });

  it('marks evidence with warnings as degraded', () => {
    expect(qualityFromWarnings([])).toBe('complete');
    expect(qualityFromWarnings(['provider returned fewer candles'])).toBe('degraded');
  });
});
