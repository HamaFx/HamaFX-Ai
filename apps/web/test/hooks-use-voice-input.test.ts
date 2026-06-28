// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useVoiceInput } from '../src/hooks/use-voice-input';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useVoiceInput — no SpeechRecognition', () => {
  it('reports supported=false when window is undefined', () => {
    const { result } = renderHook(() =>
      useVoiceInput({ lang: 'en-US', onText: vi.fn() }),
    );
    expect(result.current.supported).toBe(false);
    expect(result.current.active).toBe(false);
  });
});

describe('useVoiceInput — with SpeechRecognition', () => {
  let mockRecognition: { start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn>; abort: ReturnType<typeof vi.fn> };
  let SpeechRecognitionCtor: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockRecognition = {
      start: vi.fn(),
      stop: vi.fn(),
      abort: vi.fn(),
    };
    SpeechRecognitionCtor = vi.fn(() => ({
      lang: '',
      interimResults: false,
      continuous: false,
      onresult: null,
      onend: null,
      onerror: null,
      ...mockRecognition,
    }));
    vi.stubGlobal('window', {
      SpeechRecognition: SpeechRecognitionCtor,
      webkitSpeechRecognition: undefined,
    } as unknown as Window & typeof globalThis);
  });

  it('reports supported=true when SpeechRecognition exists', () => {
    const { result } = renderHook(() =>
      useVoiceInput({ lang: 'en-US', onText: vi.fn() }),
    );
    expect(result.current.supported).toBe(true);
    expect(result.current.active).toBe(false);
  });

  it('start creates a recognition session and sets active=true', () => {
    const { result } = renderHook(() =>
      useVoiceInput({ lang: 'en-US', onText: vi.fn() }),
    );
    act(() => result.current.start());
    expect(SpeechRecognitionCtor).toHaveBeenCalled();
    expect(mockRecognition.start).toHaveBeenCalled();
    expect(result.current.active).toBe(true);
  });

  it('stop sets active=false and calls stop on the recognition instance', () => {
    const { result } = renderHook(() =>
      useVoiceInput({ lang: 'en-US', onText: vi.fn() }),
    );
    act(() => result.current.start());
    expect(result.current.active).toBe(true);
    act(() => result.current.stop());
    expect(mockRecognition.stop).toHaveBeenCalled();
    expect(result.current.active).toBe(false);
  });

  it('onend callback sets active=false and clears ref', () => {
    const { result } = renderHook(() =>
      useVoiceInput({ lang: 'en-US', onText: vi.fn() }),
    );
    act(() => result.current.start());
    const instance = SpeechRecognitionCtor.mock.results[0].value;
    expect(instance.onend).toBeDefined();
    act(() => instance.onend());
    expect(result.current.active).toBe(false);
  });

  it('onresult callback calls onText with the concatenated transcript', () => {
    const onText = vi.fn();
    const { result } = renderHook(() =>
      useVoiceInput({ lang: 'en-US', onText }),
    );
    act(() => result.current.start());
    const instance = SpeechRecognitionCtor.mock.results[0].value;
    act(() => {
      instance.onresult({
        results: [
          { 0: { transcript: 'hello ' }, isFinal: false },
          { 0: { transcript: 'world' }, isFinal: true },
        ],
      });
    });
    expect(onText).toHaveBeenCalledWith('hello world');
  });

  it('onerror with not-allowed calls onError with permission message', () => {
    const onError = vi.fn();
    const { result } = renderHook(() =>
      useVoiceInput({ lang: 'en-US', onText: vi.fn(), onError }),
    );
    act(() => result.current.start());
    const instance = SpeechRecognitionCtor.mock.results[0].value;
    act(() => {
      instance.onerror({ error: 'not-allowed' });
    });
    expect(onError).toHaveBeenCalledWith('Microphone permission denied');
    expect(result.current.active).toBe(false);
  });

  it('onerror with no-speech calls onError with appropriate message', () => {
    const onError = vi.fn();
    const { result } = renderHook(() =>
      useVoiceInput({ lang: 'en-US', onText: vi.fn(), onError }),
    );
    act(() => result.current.start());
    const instance = SpeechRecognitionCtor.mock.results[0].value;
    act(() => {
      instance.onerror({ error: 'no-speech' });
    });
    expect(onError).toHaveBeenCalledWith('No speech detected');
  });

  it('aborts the recognition session on unmount', () => {
    const { result, unmount } = renderHook(() =>
      useVoiceInput({ lang: 'en-US', onText: vi.fn() }),
    );
    act(() => result.current.start());
    unmount();
    expect(mockRecognition.abort).toHaveBeenCalled();
  });

  it('start is a no-op when already active', () => {
    const { result } = renderHook(() =>
      useVoiceInput({ lang: 'en-US', onText: vi.fn() }),
    );
    act(() => result.current.start());
    const callCount = SpeechRecognitionCtor.mock.calls.length;
    act(() => result.current.start());
    expect(SpeechRecognitionCtor.mock.calls.length).toBe(callCount);
  });
});
