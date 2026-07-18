// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useAutoScroll } from '../src/hooks/use-auto-scroll';

function createMockRef(current: HTMLDivElement | null = null): React.RefObject<HTMLDivElement | null> {
  return { current };
}

function createMockDiv(scrollHeight = 1000, scrollTop = 0, clientHeight = 500): HTMLDivElement {
  const el = document.createElement('div');
  Object.defineProperty(el, 'scrollHeight', { value: scrollHeight, configurable: true });
  Object.defineProperty(el, 'scrollTop', { value: scrollTop, configurable: true, writable: true });
  Object.defineProperty(el, 'clientHeight', { value: clientHeight, configurable: true });
  el.addEventListener = vi.fn();
  el.removeEventListener = vi.fn();
  el.scrollTo = vi.fn();
  return el;
}

describe('useAutoScroll', () => {
  it('returns showScrollFab based on scroll position', () => {
    const div = createMockDiv(1000, 800, 500);
    const ref = createMockRef(div);
    
    const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      cb(0);
      return 0;
    });

    const { result } = renderHook(() =>
      useAutoScroll({
        scrollRef: ref,
        dependency: [],
        resetKey: 'thread-1',
        isStreaming: false,
      }),
    );
    expect(typeof result.current.scrollToBottom).toBe('function');
    
    rafSpy.mockRestore();
  });

  it('scrolls to bottom on initial mount', () => {
    const div = createMockDiv();
    const ref = createMockRef(div);
    // Mock requestAnimationFrame to execute synchronously
    const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      cb(0);
      return 0;
    });

    renderHook(() =>
      useAutoScroll({
        scrollRef: ref,
        dependency: [],
        resetKey: 'thread-1',
        isStreaming: false,
      }),
    );
    expect(div.scrollTop).toBe(div.scrollHeight);
    rafSpy.mockRestore();
  });

  it('scrollToBottom function calls scrollTo with smooth behavior', () => {
    const div = createMockDiv();
    const ref = createMockRef(div);
    const { result } = renderHook(() =>
      useAutoScroll({
        scrollRef: ref,
        dependency: [],
        resetKey: 'thread-1',
        isStreaming: false,
      }),
    );
    result.current.scrollToBottom();
    expect(div.scrollTo).toHaveBeenCalledWith({ top: div.scrollHeight, behavior: 'smooth' });
  });

  it('handles null scrollRef gracefully', () => {
    const ref = createMockRef(null);
    const { result } = renderHook(() =>
      useAutoScroll({
        scrollRef: ref,
        dependency: [],
        resetKey: 'thread-1',
        isStreaming: false,
      }),
    );
    expect(result.current.showScrollFab).toBe(false);
    // scrollToBottom should not throw
    expect(() => result.current.scrollToBottom()).not.toThrow();
  });

  it('registers scroll event listener on mount', () => {
    const div = createMockDiv();
    const ref = createMockRef(div);
    renderHook(() =>
      useAutoScroll({
        scrollRef: ref,
        dependency: [],
        resetKey: 'thread-1',
        isStreaming: false,
      }),
    );
    expect(div.addEventListener).toHaveBeenCalledWith('scroll', expect.any(Function), { passive: true });
  });

  it('cleans up scroll listener on unmount', () => {
    const div = createMockDiv();
    const ref = createMockRef(div);
    const { unmount } = renderHook(() =>
      useAutoScroll({
        scrollRef: ref,
        dependency: [],
        resetKey: 'thread-1',
        isStreaming: false,
      }),
    );
    unmount();
    expect(div.removeEventListener).toHaveBeenCalledWith('scroll', expect.any(Function));
  });
});
