// @vitest-environment jsdom
import { createElement } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { usePrices, usePrice } from '../src/hooks/use-prices';

vi.mock('@/lib/market-client', () => ({
  fetchPrices: vi.fn(),
}));

import { fetchPrices } from '@/lib/market-client';
const mockFetchPrices = vi.mocked(fetchPrices);

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
}

describe('usePrices', () => {
  beforeEach(() => {
    mockFetchPrices.mockReset();
  });

  it('returns empty data when no symbols are provided', () => {
    const { result } = renderHook(() => usePrices([]), { wrapper: createWrapper() });
    expect(result.current.data).toBeUndefined();
    expect(mockFetchPrices).not.toHaveBeenCalled();
  });

  it('fetches and returns prices for given symbols', async () => {
    const ticks = [
      { symbol: 'XAUUSD', bid: 1900.5, ask: 1901.0, mid: 1900.75, ts: 1, source: 'test' },
      { symbol: 'EURUSD', bid: 1.05, ask: 1.06, mid: 1.055, ts: 1, source: 'test' },
    ];
    mockFetchPrices.mockResolvedValue(ticks);

    const { result } = renderHook(() => usePrices(['XAUUSD', 'EURUSD']), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.data).toEqual(ticks));
    expect(mockFetchPrices).toHaveBeenCalledWith(
      ['EURUSD', 'XAUUSD'],
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });
});

describe('usePrice', () => {
  beforeEach(() => {
    mockFetchPrices.mockReset();
  });

  it('extracts the tick for the requested symbol', async () => {
    const ticks = [
      { symbol: 'XAUUSD', bid: 1900.5, ask: 1901.0, mid: 1900.75, ts: 1, source: 'test' },
      { symbol: 'EURUSD', bid: 1.05, ask: 1.06, mid: 1.055, ts: 1, source: 'test' },
    ];
    mockFetchPrices.mockResolvedValue(ticks);

    const { result } = renderHook(() => usePrice('XAUUSD'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.tick).toEqual(ticks[0]));
  });

  it('returns undefined tick when symbol is not in the response', async () => {
    mockFetchPrices.mockResolvedValue([
      { symbol: 'EURUSD', bid: 1.05, ask: 1.06, mid: 1.055, ts: 1, source: 'test' },
    ]);

    const { result } = renderHook(() => usePrice('GBPUSD'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.tick).toBeUndefined();
  });
});
