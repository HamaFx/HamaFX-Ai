// SPDX-License-Identifier: Apache-2.0
// @vitest-environment jsdom

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';

let visibilityState: VisibilityState = 'visible';

Object.defineProperty(document, 'visibilityState', {
  get: () => visibilityState,
  configurable: true,
});

const mockApiFetch = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api-client', () => ({
  apiFetch: mockApiFetch,
}));

import { AdminSystemHealth } from '@/app/(app)/admin/_components/admin-system-health';

describe('AdminSystemHealth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: false });
    visibilityState = 'visible';
  });

  afterEach(() => {
    cleanup();
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('fetches health on mount and every 30 seconds while visible', async () => {
    mockApiFetch.mockResolvedValue({
      ts: new Date().toISOString(),
      dbOk: true,
      overall: 'healthy',
      langfuseActive: false,
      langfuseBaseUrl: null,
      slis: [],
      anomalies: [],
      dbLatencyMs: 1,
    });

    render(<AdminSystemHealth />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(mockApiFetch).toHaveBeenCalledTimes(1);
    expect(screen.getByText('All Systems Healthy')).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(mockApiFetch).toHaveBeenCalledTimes(2);
  });

  it('skips fetching while hidden and resumes when visible', async () => {
    mockApiFetch.mockResolvedValue({
      ts: new Date().toISOString(),
      dbOk: true,
      overall: 'healthy',
      langfuseActive: false,
      langfuseBaseUrl: null,
      slis: [],
      anomalies: [],
      dbLatencyMs: 1,
    });

    render(<AdminSystemHealth />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(mockApiFetch).toHaveBeenCalledTimes(1);

    visibilityState = 'hidden';
    document.dispatchEvent(new Event('visibilitychange'));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(mockApiFetch).toHaveBeenCalledTimes(1);

    visibilityState = 'visible';
    document.dispatchEvent(new Event('visibilitychange'));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(mockApiFetch).toHaveBeenCalledTimes(2);
  });

  it('aborts in-flight requests on unmount', async () => {
    let signal: AbortSignal | undefined;
    mockApiFetch.mockImplementation((_input, options) => {
      signal = options.signal;
      return new Promise(() => {
        // never resolves
      });
    });

    const { unmount } = render(<AdminSystemHealth />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(signal).toBeDefined();
    unmount();

    expect(signal?.aborted).toBe(true);
  });
});
