// @vitest-environment jsdom
import { createElement } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useChartData } from '../src/hooks/use-chart-data';

vi.mock('@/lib/market-client', () => ({
  fetchCandles: vi.fn(),
  fetchChartData: vi.fn(),
}));

import { fetchCandles, fetchChartData } from '@/lib/market-client';
const mockFetchCandles = vi.mocked(fetchCandles);
const mockFetchChartData = vi.mocked(fetchChartData);

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
}

const mockCandle = (overrides = {}) => ({
  symbol: 'XAUUSD', tf: '1h', t: 1, o: 100, h: 110, l: 99, c: 105, v: 1000, source: 'test', fetchedAt: 1,
  ...overrides,
});

describe('useChartData', () => {
  beforeEach(() => {
    mockFetchCandles.mockReset();
    mockFetchChartData.mockReset();
  });

  it('returns empty candles array when data is not loaded', () => {
    const { result } = renderHook(
      () => useChartData('XAUUSD', '1h', [], 300),
      { wrapper: createWrapper() },
    );

    expect(result.current.candles).toEqual([]);
    expect(result.current.indicatorResults).toBeNull();
    expect(result.current.isLoading).toBe(true);
  });

  it('fetches candles only when no indicators are requested', async () => {
    const candles = [mockCandle()];
    mockFetchCandles.mockResolvedValue(candles);

    const { result } = renderHook(
      () => useChartData('XAUUSD', '1h', [], 300),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.candles).toEqual(candles));
    expect(result.current.indicatorResults).toBeNull();
    expect(mockFetchChartData).not.toHaveBeenCalled();
  });

  it('fetches chart data when indicators are requested', async () => {
    const candles = [mockCandle()];
    const results = [
      { symbol: 'XAUUSD', tf: '1h', kind: 'rsi', params: { period: 14 }, values: [{ t: 1, v: 50 }], fetchedAt: 1 },
    ];
    mockFetchChartData.mockResolvedValue({ candles, results });

    const { result } = renderHook(
      () => useChartData('XAUUSD', '1h', [{ kind: 'rsi', params: { period: 14 } }], 300),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.candles).toEqual(candles));
    expect(result.current.indicatorResults).toEqual(results);
    expect(mockFetchCandles).not.toHaveBeenCalled();
  });

  it('does not fetch when enabled is false', () => {
    const { result } = renderHook(
      () => useChartData('XAUUSD', '1h', [], 300, { enabled: false }),
      { wrapper: createWrapper() },
    );

    expect(mockFetchCandles).not.toHaveBeenCalled();
    expect(mockFetchChartData).not.toHaveBeenCalled();
    expect(result.current.candles).toEqual([]);
  });

  it('surfaces errors from fetchCandles', async () => {
    mockFetchCandles.mockRejectedValue(new Error('Candle fetch failed'));

    const { result } = renderHook(
      () => useChartData('XAUUSD', '1h', [], 300),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.error).toBeDefined());
    expect(result.current.candles).toEqual([]);
  });

  it('surfaces errors from fetchChartData', async () => {
    mockFetchChartData.mockRejectedValue(new Error('Chart data fetch failed'));

    const { result } = renderHook(
      () => useChartData('XAUUSD', '1h', [{ kind: 'ema', params: { period: 20 } }], 300),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.error).toBeDefined());
    expect(result.current.candles).toEqual([]);
  });

  it('prefetches adjacent timeframes when enabled', async () => {
    mockFetchCandles.mockResolvedValue([mockCandle()]);

    renderHook(
      () => useChartData('XAUUSD', '1h', [], 300),
      { wrapper: createWrapper() },
    );

    // Adjacent timeframes for '1h' are ['30m', '4h']
    await waitFor(() => {
      expect(mockFetchCandles).toHaveBeenCalledWith('XAUUSD', '30m', 300, expect.any(Object));
    });
    await waitFor(() => {
      expect(mockFetchCandles).toHaveBeenCalledWith('XAUUSD', '4h', 300, expect.any(Object));
    });
  });
});
