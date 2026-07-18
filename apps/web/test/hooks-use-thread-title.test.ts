// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useThreadTitle } from '../src/hooks/use-thread-title';

describe('useThreadTitle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('returns the initial title', () => {
    const { result } = renderHook(() =>
      useThreadTitle({
        threadId: 'thread-1',
        initialTitle: 'My Chat',
        status: 'ready',
        messageCount: 0,
      }),
    );
    expect(result.current.title).toBe('My Chat');
  });

  it('fetches LLM title when status is ready and has 2+ messages', async () => {
    let resolveJson: (value: unknown) => void;
    const jsonPromise = new Promise((resolve) => { resolveJson = resolve; });

    const fetchMock = vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: () => jsonPromise,
    } as Response);

    const { result } = renderHook(() =>
      useThreadTitle({
        threadId: 'thread-2',
        initialTitle: 'New Chat',
        status: 'ready',
        messageCount: 5,
      }),
    );

    // Wait for the fetch to be called
    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/chat/threads/thread-2');
    });

    // Resolve the JSON promise
    await act(async () => {
      resolveJson!({ thread: { title: 'Gold Analysis', titleSource: 'llm' } });
    });

    expect(result.current.title).toBe('Gold Analysis');
  });

  it('does not fetch when messageCount < 2', () => {
    const fetchMock = vi.mocked(global.fetch);

    renderHook(() =>
      useThreadTitle({
        threadId: 'thread-3',
        initialTitle: 'New Chat',
        status: 'ready',
        messageCount: 1,
      }),
    );

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not fetch when status is not ready', () => {
    const fetchMock = vi.mocked(global.fetch);

    renderHook(() =>
      useThreadTitle({
        threadId: 'thread-4',
        initialTitle: 'New Chat',
        status: 'submitted',
        messageCount: 5,
      }),
    );

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('keeps initial title when fetch fails', async () => {
    vi.mocked(global.fetch).mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() =>
      useThreadTitle({
        threadId: 'thread-5',
        initialTitle: 'Stable Title',
        status: 'ready',
        messageCount: 3,
      }),
    );

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(result.current.title).toBe('Stable Title');
  });

  it('deduplicates fetches by threadId', async () => {
    const fetchMock = vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          thread: { title: 'Analysis', titleSource: 'llm' },
        }),
    } as Response);

    const { result, rerender } = renderHook(
      (props) => useThreadTitle(props),
      {
        initialProps: {
          threadId: 'thread-6',
          initialTitle: 'Chat',
          status: 'ready',
          messageCount: 3,
        },
      },
    );

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Rerender with same threadId should not fetch again
    rerender({
      threadId: 'thread-6',
      initialTitle: 'Chat',
      status: 'ready',
      messageCount: 10,
    });

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    // Still only one call
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
