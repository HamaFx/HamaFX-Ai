import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getPriceWithMeta: vi.fn(),
  getCandlesWithMeta: vi.fn(),
  fetchNews: vi.fn(),
  fetchUpcomingEvents: vi.fn(),
  recordStep: vi.fn(),
  completeStep: vi.fn(),
  logErrorContext: vi.fn(),
}));

vi.mock('@kestrel/data', () => ({
  getPriceWithMeta: mocks.getPriceWithMeta,
  getCandlesWithMeta: mocks.getCandlesWithMeta,
  fetchNews: mocks.fetchNews,
  fetchUpcomingEvents: mocks.fetchUpcomingEvents,
}));
vi.mock('../src/diagnostics', () => ({
  recordStep: mocks.recordStep,
  completeStep: mocks.completeStep,
}));
vi.mock('@kestrel/shared/logger', () => ({
  createCategorizedLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  logErrorContext: mocks.logErrorContext,
}));

import { metrics } from '@kestrel/shared';
import { collectXauusdResearchPacket } from '../src/mastra/research-packet';

function candlesFor(tf: string, count = 40) {
  return Array.from({ length: count }, (_, index) => ({
    symbol: 'XAUUSD',
    tf,
    t: 1_700_000_000_000 + index * 60_000,
    o: 2_000 + index,
    h: 2_005 + index,
    l: 1_995 + index,
    c: 2_002 + index,
    v: null,
    source: 'fixture-provider',
    fetchedAt: 1_700_000_000_000,
  }));
}

function configureSuccessfulData() {
  const now = Date.now();
  mocks.getPriceWithMeta.mockResolvedValue({
    tick: {
      symbol: 'XAUUSD',
      bid: 2_345,
      ask: 2_345.2,
      mid: 2_345.1,
      ts: now - 100,
      source: 'fixture-provider',
    },
    stale: false,
    producedAt: now,
    ageMs: 100,
  });
  mocks.getCandlesWithMeta.mockImplementation(async (_symbol: string, tf: string) => ({
    candles: candlesFor(tf),
    stale: false,
    producedAt: now,
  }));
}

describe('bounded XAUUSD research packet', () => {
  beforeEach(() => {
    metrics.reset();
    mocks.getPriceWithMeta.mockReset();
    mocks.getCandlesWithMeta.mockReset();
    mocks.fetchNews.mockReset().mockResolvedValue([]);
    mocks.fetchUpcomingEvents.mockReset().mockResolvedValue([]);
    mocks.recordStep.mockReset();
    mocks.completeStep.mockReset();
    mocks.logErrorContext.mockReset();
  });

  it('collects the fixed multi-timeframe scope and computes indicators in code', async () => {
    configureSuccessfulData();

    const packet = await collectXauusdResearchPacket();

    expect(packet).toMatchObject({
      kind: 'research_packet',
      symbol: 'XAUUSD',
      status: 'ready',
      dataQuality: 'partial',
      timeframes: ['1d', '4h', '1h', '15m'],
      price: { kind: 'price', source: 'fixture-provider' },
    });
    expect(packet.candles).toHaveLength(4);
    expect(packet.indicators).toHaveLength(4);
    expect(packet.indicators[0]?.data.results).toHaveLength(6);
    expect(packet.missingData).toEqual(expect.arrayContaining([
      'Dollar-strength data is unavailable.',
      'US real-yield and inflation-expectation data is unavailable.',
      'No macro evidence was returned by the configured providers.',
    ]));
    expect(mocks.getPriceWithMeta).toHaveBeenCalledOnce();
    expect(mocks.getCandlesWithMeta).toHaveBeenCalledTimes(4);
    expect(metrics.snapshot().counters['mastra_research_packet_total{status=ready,symbol=XAUUSD}']).toBe(1);
  });

  it('blocks the packet when one required timeframe is unavailable', async () => {
    configureSuccessfulData();
    mocks.getCandlesWithMeta
      .mockReset()
      .mockImplementation(async (_symbol: string, tf: string) => {
        if (tf === '1h') throw new Error('provider unavailable');
        return { candles: candlesFor(tf), stale: false, producedAt: Date.now() };
      });

    const packet = await collectXauusdResearchPacket();

    expect(packet.status).toBe('blocked');
    expect(packet.dataQuality).toBe('degraded');
    expect(packet.missingData).toContain('1h candle data is unavailable.');
    expect(packet.indicators.some((evidence) => evidence.timeframe === '1h')).toBe(false);
    expect(mocks.logErrorContext).toHaveBeenCalledWith(
      expect.any(Error),
      'mastra_xauusd_research.candles.1h',
      expect.objectContaining({ timeframe: '1h' }),
      'ai',
    );
    expect(metrics.snapshot().counters['mastra_research_packet_blocked_total{symbol=XAUUSD}']).toBe(1);
  });

  it('propagates cancellation instead of returning a misleading packet', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(collectXauusdResearchPacket(controller.signal)).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(mocks.getPriceWithMeta).not.toHaveBeenCalled();
    expect(mocks.getCandlesWithMeta).not.toHaveBeenCalled();
  });
});
