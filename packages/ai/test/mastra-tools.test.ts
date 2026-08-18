import { RequestContext } from '@mastra/core/request-context';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getPriceWithMeta: vi.fn(),
  getCandlesWithMeta: vi.fn(),
  computeIndicator: vi.fn(),
  executeMastraTool: vi.fn(async (_toolName: string, _context: unknown, fn: () => Promise<unknown>) => fn()),
}));

vi.mock('@kestrel/data', () => ({
  getPriceWithMeta: mocks.getPriceWithMeta,
  getCandlesWithMeta: mocks.getCandlesWithMeta,
}));
vi.mock('@kestrel/indicators', () => ({
  computeIndicator: mocks.computeIndicator,
}));
vi.mock('../src/mastra/telemetry', () => ({
  executeMastraTool: mocks.executeMastraTool,
}));

import { xauusdPriceTool } from '../src/mastra/tools';

describe('Mastra XAUUSD tools', () => {
  beforeEach(() => {
    mocks.getPriceWithMeta.mockReset();
    mocks.executeMastraTool.mockClear();
  });

  it('returns a validated price evidence envelope and routes through telemetry', async () => {
    const now = Date.now();
    mocks.getPriceWithMeta.mockResolvedValue({
      tick: {
        symbol: 'XAUUSD',
        bid: 2345.5,
        ask: 2345.7,
        mid: 2345.6,
        ts: now - 200,
        source: 'test-provider',
      },
      stale: false,
      producedAt: now,
      ageMs: 200,
    });

    const requestContext = new RequestContext([
      ['userId', 'user-1'],
      ['runId', 'run-1'],
      ['threadId', 'thread-1'],
    ]);
    const execute = xauusdPriceTool.execute!;
    const context = { requestContext } as Parameters<typeof execute>[1];
    const result = await execute({ symbol: 'XAUUSD' }, context);

    expect(result).toMatchObject({
      kind: 'price',
      symbol: 'XAUUSD',
      source: 'test-provider',
      freshness: 'fresh',
      quality: 'complete',
      data: { tick: { mid: 2345.6 }, stale: false, ageMs: 200 },
    });
    if (!result || typeof result !== 'object' || !('evidenceId' in result)) {
      throw new Error('Expected a price evidence envelope');
    }
    expect(result.evidenceId).toMatch(/^kestrel-price-xauusd-/);
    expect(mocks.executeMastraTool).toHaveBeenCalledWith(
      'get-xauusd-price',
      context,
      expect.any(Function),
    );
  });
});
