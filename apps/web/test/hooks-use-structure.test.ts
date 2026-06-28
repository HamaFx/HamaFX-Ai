// @vitest-environment jsdom
import { createElement } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useStructure } from '../src/hooks/use-structure';

vi.mock('@/lib/market-client', () => ({
  fetchStructure: vi.fn(),
}));

import { fetchStructure } from '@/lib/market-client';
const mockFetchStructure = vi.mocked(fetchStructure);

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
}

describe('useStructure', () => {
  beforeEach(() => {
    mockFetchStructure.mockReset();
  });

  it('fetches and returns structure result', async () => {
    const structureResult = {
      symbol: 'XAUUSD',
      tf: '1h',
      bars: 300,
      swings: [{ index: 10, time: 1, price: 105, type: 'high', lookback: 3 }],
      fetchedAt: 1,
    };
    mockFetchStructure.mockResolvedValue(structureResult);

    const { result } = renderHook(() => useStructure('XAUUSD', '1h'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.data).toEqual(structureResult));
    expect(mockFetchStructure).toHaveBeenCalledWith(
      'XAUUSD', '1h',
      expect.objectContaining({ count: 300, lookback: 3, signal: expect.any(AbortSignal) }),
    );
  });

  it('passes custom count, lookback, and kinds options', async () => {
    mockFetchStructure.mockResolvedValue({
      symbol: 'EURUSD', tf: '15m', bars: 100, fetchedAt: 1,
    });

    renderHook(() => useStructure('EURUSD', '15m', { count: 100, lookback: 5, kinds: ['bos', 'fvg'] }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(mockFetchStructure).toHaveBeenCalledWith(
      'EURUSD', '15m',
      expect.objectContaining({ count: 100, lookback: 5, kinds: ['bos', 'fvg'], signal: expect.any(AbortSignal) }),
    ));
  });

  it('does not fetch when enabled is false', () => {
    const { result } = renderHook(
      () => useStructure('XAUUSD', '1h', { enabled: false }),
      { wrapper: createWrapper() },
    );

    expect(mockFetchStructure).not.toHaveBeenCalled();
    expect(result.current.isFetching).toBe(false);
  });

  it('handles errors from fetchStructure gracefully', () => {
    mockFetchStructure.mockRejectedValue(new Error('Structure fetch failed'));

    const { result } = renderHook(() => useStructure('XAUUSD', '1h'), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toBeUndefined();
  });
});
