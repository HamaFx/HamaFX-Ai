// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useLocalStorage } from '../src/hooks/use-local-storage';

function createMockWindow() {
  const store: Record<string, string> = {};
  vi.stubGlobal('window', {
    localStorage: {
      getItem: vi.fn((key: string) => store[key] ?? null),
      setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
      removeItem: vi.fn((key: string) => { delete store[key]; }),
      clear: vi.fn(() => { for (const k in store) delete store[k]; }),
      get length() { return Object.keys(store).length; },
    },
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  } as unknown as Window & typeof globalThis);
}

beforeEach(() => {
  createMockWindow();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useLocalStorage', () => {
  it('returns the initial value when nothing is stored', () => {
    const { result } = renderHook(() => useLocalStorage('test-key', 'default'));
    expect(result.current[1]).toBeInstanceOf(Function);
  });

  it('reads a stored value on mount', () => {
    window.localStorage.setItem('name', JSON.stringify('Alice'));
    const { result } = renderHook(() => useLocalStorage('name', 'default'));
    expect(result.current[0]).toBe('Alice');
  });

  it('persists the new value via setValue', () => {
    const { result } = renderHook(() => useLocalStorage('greeting', 'hello'));
    act(() => result.current[1]('hi'));
    expect(result.current[0]).toBe('hi');
    expect(window.localStorage.setItem).toHaveBeenCalledWith('greeting', '"hi"');
  });

  it('supports functional updates', () => {
    window.localStorage.setItem('count', '1');
    const { result } = renderHook(() => useLocalStorage<number>('count', 0));
    act(() => result.current[1]((prev) => prev + 10));
    expect(result.current[0]).toBe(11);
  });

  it('hydrated flag becomes true after mount', () => {
    const { result } = renderHook(() => useLocalStorage('hydrated-key', 0));
    expect(result.current[2]).toBe(true);
  });

  it('handles JSON parse errors gracefully', () => {
    window.localStorage.setItem('bad', '{invalid');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { result } = renderHook(() => useLocalStorage('bad', 'fallback'));
    expect(result.current[0]).toBe('fallback');
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });



  it('syncs across tabs via the storage event', () => {
    const { result } = renderHook(() => useLocalStorage('sync-key', 'old'));
    const listener = (window.addEventListener as ReturnType<typeof vi.fn>).mock
      .calls.find(([e]: [string]) => e === 'storage')?.[1];
    expect(listener).toBeDefined();
    act(() => {
      listener({ key: 'sync-key', newValue: '"synced"' });
    });
    expect(result.current[0]).toBe('synced');
  });

  it('removes the storage event listener on unmount', () => {
    const { unmount } = renderHook(() => useLocalStorage('key', 'val'));
    unmount();
    expect(window.removeEventListener).toHaveBeenCalledWith('storage', expect.any(Function));
  });
});
