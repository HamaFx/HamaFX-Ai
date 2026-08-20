import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getPriceWithMeta: vi.fn(),
  getCandlesWithMeta: vi.fn(),
  computeIndicator: vi.fn(),
}));

vi.mock('@kestrel/data', () => ({
  getPriceWithMeta: mocks.getPriceWithMeta,
  getCandlesWithMeta: mocks.getCandlesWithMeta,
}));
vi.mock('@kestrel/indicators', () => ({ computeIndicator: mocks.computeIndicator }));

import { collectSymbolResearchPacket } from '../src/mastra/symbol-research';

function candles(symbol: string, timeframe: string, count = 200) {
  return Array.from({ length: count }, (_, index) => ({
    symbol,
    tf: timeframe,
    t: Date.parse('2026-08-19T12:00:00.000Z') + index * 60_000,
    o: 1 + index / 1000,
    h: 1.01 + index / 1000,
    l: 0.99 + index / 1000,
    c: 1 + index / 1000,
    v: null,
    source: 'fixture',
    fetchedAt: Date.now(),
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getPriceWithMeta.mockResolvedValue({
    tick: { symbol: 'EURUSD', bid: 1.1, ask: 1.1, mid: 1.1, ts: Date.now(), source: 'fixture' },
    stale: false,
    producedAt: Date.now(),
    ageMs: 100,
  });
  mocks.getCandlesWithMeta.mockImplementation(async (symbol: string, timeframe: string) => ({
    candles: candles(symbol, timeframe),
    stale: false,
    producedAt: Date.now(),
  }));
  mocks.computeIndicator.mockImplementation(({ symbol, tf, kind, params }: { symbol: string; tf: string; kind: string; params: Record<string, number> }) => ({
    symbol,
    tf,
    kind,
    params,
    values: [1, 2, 3],
    fetchedAt: Date.now(),
  }));
});

describe('generalized symbol research packet', () => {
  it('collects one bounded packet for a supported forex symbol', async () => {
    const packet = await collectSymbolResearchPacket('EURUSD');

    expect(packet).toMatchObject({
      kind: 'symbol_research_packet',
      symbol: 'EURUSD',
      status: 'ready',
      dataQuality: 'complete',
      optionalContext: { available: false },
    });
    expect(packet.timeframes.map((entry) => entry.timeframe)).toEqual(['1d', '4h', '1h', '15m']);
    expect(packet.timeframes[0]?.candles).toHaveLength(80);
    expect(mocks.getPriceWithMeta).toHaveBeenCalledWith('EURUSD', {});
    expect(mocks.getCandlesWithMeta).toHaveBeenCalledTimes(4);
  });

  it('blocks when required price or timeframe data is unavailable', async () => {
    mocks.getPriceWithMeta.mockRejectedValueOnce(new Error('price unavailable'));
    mocks.getCandlesWithMeta.mockImplementationOnce(async () => ({ candles: [], stale: false, producedAt: Date.now() }));

    const packet = await collectSymbolResearchPacket('BTCUSDT');

    expect(packet.status).toBe('blocked');
    expect(packet.dataQuality).toBe('degraded');
    expect(packet.missingData).toEqual(expect.arrayContaining([
      'Current BTCUSDT price is unavailable.',
      'BTCUSDT 1d returned no candles.',
    ]));
  });

  it('forwards cancellation to every data request and fails closed', async () => {
    const controller = new AbortController();
    const error = new DOMException('Aborted', 'AbortError');
    mocks.getPriceWithMeta.mockRejectedValueOnce(error);
    controller.abort(error);

    await expect(collectSymbolResearchPacket('GBPUSD', controller.signal)).rejects.toBe(error);
  });
});
