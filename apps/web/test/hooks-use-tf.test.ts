// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTimeframe } from '../src/hooks/use-tf';

const mockSetTf = vi.fn();

vi.mock('nuqs', () => ({
  parseAsStringLiteral: () => ({
    withDefault: vi.fn(() => '1h'),
  }),
  useQueryState: vi.fn(() => ['1h', mockSetTf]),
}));

describe('useTimeframe', () => {
  it('returns the default timeframe from URL state', () => {
    const { result } = renderHook(() => useTimeframe());
    expect(result.current[0]).toBe('1h');
    expect(typeof result.current[1]).toBe('function');
  });

  it('calls setTf when the setter is invoked', () => {
    const { result } = renderHook(() => useTimeframe());
    act(() => result.current[1]('5m'));
    expect(mockSetTf).toHaveBeenCalledWith('5m');
  });
});
