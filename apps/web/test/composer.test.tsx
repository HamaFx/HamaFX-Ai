// @vitest-environment jsdom
/**
 * Copyright 2026 HamaFX
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import React from 'react';
import { afterEach, beforeAll, describe, it, expect, vi } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';

// Polyfill window.matchMedia for jsdom (used by Composer to detect touch).
beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
});

// Mock next/image to render a plain <img> in jsdom.
vi.mock('next/image', () => ({
  default: (props: React.ImgHTMLAttributes<HTMLImageElement>) => {
    const { unoptimized, ...rest } = props as React.ImgHTMLAttributes<HTMLImageElement> & { unoptimized?: boolean };
    return <img {...rest} />;
  },
}));

// ------- Mutable mock objects for hooks -------
// These are mutated per-test via `beforeEach` or directly.
// Using mutable objects avoids any vitest hoisting closure issues.

const voiceMock: { supported: boolean; active: boolean; start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn> } = {
  supported: true,
  active: false,
  start: vi.fn(),
  stop: vi.fn(),
};

vi.mock('@/hooks/use-voice-input', () => ({
  useVoiceInput: () => voiceMock,
}));

// Mock fetchCsrf to return a successful upload response.
vi.mock('@/lib/csrf', () => ({
  fetchCsrf: vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ url: 'https://example.com/img.jpg', mediaType: 'image/jpeg' }),
    text: () => Promise.resolve(''),
  }),
}));

import { Composer } from '@/components/chat/composer';
import { MAX_TEXT_CHARS } from '@/components/chat/composer-helpers';

afterEach(cleanup);

describe('Composer', () => {
  describe('basic rendering', () => {
    it('renders without crashing', () => {
      const { container } = render(<Composer onSubmit={vi.fn()} />);
      expect(container.querySelector('textarea')).toBeTruthy();
    });

    it('renders textarea with default placeholder', () => {
      render(<Composer onSubmit={vi.fn()} />);
      const textarea = screen.getByRole('textbox', { name: /chat message input/i });
      expect(textarea.getAttribute('placeholder')).toBe('Ask anything…');
    });

    it('renders textarea with custom placeholder', () => {
      render(<Composer onSubmit={vi.fn()} placeholder="Ask about XAUUSD…" />);
      const textarea = screen.getByRole('textbox', { name: /chat message input/i });
      expect(textarea.getAttribute('placeholder')).toBe('Ask about XAUUSD…');
    });

    it('renders send button with aria-label', () => {
      render(<Composer onSubmit={vi.fn()} />);
      const btn = screen.queryByLabelText('Send message');
      expect(btn).toBeTruthy();
    });

    it('renders attach image button', () => {
      render(<Composer onSubmit={vi.fn()} />);
      expect(screen.getByLabelText('Attach image')).toBeTruthy();
    });

    it('renders char count display', () => {
      render(<Composer onSubmit={vi.fn()} />);
      const countEl = screen.getByText(/0 \/ 8000/);
      expect(countEl).toBeTruthy();
    });

    it('renders voice input button by default', () => {
      render(<Composer onSubmit={vi.fn()} />);
      expect(screen.getByLabelText('Start voice input')).toBeTruthy();
    });
  });

  describe('text input and submit', () => {
    it('renders textarea with correct value after typing', () => {
      render(<Composer onSubmit={vi.fn()} />);
      const textarea = screen.getByRole('textbox', { name: /chat message input/i });

      // fireEvent.change triggers React onChange which calls handleSlashChange
      // which calls setValue, updating the component state.
      fireEvent.change(textarea, { target: { value: 'Hello world' } });

      expect((textarea as HTMLTextAreaElement).value).toBe('Hello world');
    });

    it('calls onSubmit when form is submitted after typing', () => {
      const onSubmit = vi.fn();
      render(<Composer onSubmit={onSubmit} />);
      const textarea = screen.getByRole('textbox', { name: /chat message input/i });

      fireEvent.change(textarea, { target: { value: 'Hello world' } });

      const form = textarea.closest('form')!;
      fireEvent.submit(form);

      expect(onSubmit).toHaveBeenCalledTimes(1);
      expect(onSubmit).toHaveBeenCalledWith('Hello world', []);
    });

    it('calls onSubmit when Enter is pressed after typing', () => {
      const onSubmit = vi.fn();
      render(<Composer onSubmit={onSubmit} />);
      const textarea = screen.getByRole('textbox', { name: /chat message input/i });

      fireEvent.change(textarea, { target: { value: 'Show me EURUSD' } });
      fireEvent.keyDown(textarea, { key: 'Enter' });

      expect(onSubmit).toHaveBeenCalledTimes(1);
      expect(onSubmit).toHaveBeenCalledWith('Show me EURUSD', []);
    });

    it('does not call onSubmit for Shift+Enter', () => {
      const onSubmit = vi.fn();
      render(<Composer onSubmit={onSubmit} />);
      const textarea = screen.getByRole('textbox', { name: /chat message input/i });

      fireEvent.change(textarea, { target: { value: 'line 1' } });
      fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true });

      expect(onSubmit).not.toHaveBeenCalled();
    });

    it('clears textarea after submit', () => {
      const onSubmit = vi.fn();
      render(<Composer onSubmit={onSubmit} />);
      const textarea = screen.getByRole('textbox', { name: /chat message input/i });

      fireEvent.change(textarea, { target: { value: 'Hello' } });

      const form = textarea.closest('form')!;
      fireEvent.submit(form);

      expect((textarea as HTMLTextAreaElement).value).toBe('');
    });

    it('trims whitespace before submit', () => {
      const onSubmit = vi.fn();
      render(<Composer onSubmit={onSubmit} />);
      const textarea = screen.getByRole('textbox', { name: /chat message input/i });

      fireEvent.change(textarea, { target: { value: '  hello world  ' } });

      const form = textarea.closest('form')!;
      fireEvent.submit(form);

      expect(onSubmit).toHaveBeenCalledWith('hello world', []);
    });
  });

  describe('submit prevention', () => {
    it('does not submit when text is empty', () => {
      const onSubmit = vi.fn();
      render(<Composer onSubmit={onSubmit} />);
      const textarea = screen.getByRole('textbox', { name: /chat message input/i });
      const form = textarea.closest('form')!;
      fireEvent.submit(form);

      expect(onSubmit).not.toHaveBeenCalled();
    });

    it('does not submit when disabled', () => {
      const onSubmit = vi.fn();
      render(<Composer onSubmit={onSubmit} disabled />);
      const textarea = screen.getByRole('textbox', { name: /chat message input/i });
      (textarea as HTMLTextAreaElement).value = 'Hello';
      fireEvent.input(textarea);

      // After input, the component needs a re-render. wait a tick.
      const form = textarea.closest('form')!;
      fireEvent.submit(form);

      expect(onSubmit).not.toHaveBeenCalled();
    });

    it('does not submit when streaming', () => {
      const onSubmit = vi.fn();
      render(<Composer onSubmit={onSubmit} isStreaming />);
      const textarea = screen.getByRole('textbox', { name: /chat message input/i });
      (textarea as HTMLTextAreaElement).value = 'Hello';
      fireEvent.input(textarea);

      const form = textarea.closest('form')!;
      fireEvent.submit(form);

      expect(onSubmit).not.toHaveBeenCalled();
    });

    it('disables textarea when disabled', () => {
      render(<Composer onSubmit={vi.fn()} disabled />);
      const textarea = screen.getByRole('textbox', { name: /chat message input/i });
      expect(textarea.hasAttribute('disabled')).toBe(true);
    });
  });

  describe('streaming state', () => {
    it('shows stop button when streaming', () => {
      render(<Composer onSubmit={vi.fn()} onStop={vi.fn()} isStreaming />);
      expect(screen.getByLabelText('Stop generating')).toBeTruthy();
    });

    it('hides send button when streaming', () => {
      render(<Composer onSubmit={vi.fn()} onStop={vi.fn()} isStreaming />);
      expect(screen.queryByLabelText('Send message')).toBeNull();
    });

    it('calls onStop when stop button clicked', () => {
      const onStop = vi.fn();
      render(<Composer onSubmit={vi.fn()} onStop={onStop} isStreaming />);
      fireEvent.click(screen.getByLabelText('Stop generating'));
      expect(onStop).toHaveBeenCalledTimes(1);
    });
  });

  describe('char count', () => {
    it('char count display includes aria-label', () => {
      const onSubmit = vi.fn();
      render(<Composer onSubmit={onSubmit} />);
      // Initially 0 chars
      const countEl = screen.getByLabelText('0 of 8000 characters used');
      expect(countEl).toBeTruthy();
    });
  });

  describe('voice input', () => {
    it('hides voice button when not supported', () => {
      voiceMock.supported = false;
      voiceMock.active = false;
      render(<Composer onSubmit={vi.fn()} />);
      expect(screen.queryByLabelText('Start voice input')).toBeNull();
      // Reset for other tests
      voiceMock.supported = true;
    });

    it('shows "Listening…" pill when voice is active', () => {
      voiceMock.supported = true;
      voiceMock.active = true;
      render(<Composer onSubmit={vi.fn()} />);
      expect(screen.getByText(/Listening…/)).toBeTruthy();
      voiceMock.active = false;
    });

    it('shows "Stop voice input" label when active', () => {
      voiceMock.supported = true;
      voiceMock.active = true;
      render(<Composer onSubmit={vi.fn()} />);
      expect(screen.getByLabelText('Stop voice input')).toBeTruthy();
      voiceMock.active = false;
    });
  });

  describe('image attachment', () => {
    it('renders hidden file input with accept=image/*', () => {
      render(<Composer onSubmit={vi.fn()} />);
      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      expect(fileInput).toBeTruthy();
      expect(fileInput.accept).toBe('image/*');
    });

    it('disables attach button when disabled', () => {
      render(<Composer onSubmit={vi.fn()} disabled />);
      const btn = screen.getByLabelText('Attach image');
      expect(btn.hasAttribute('disabled')).toBe(true);
    });

    it('enables attach button when not disabled', () => {
      render(<Composer onSubmit={vi.fn()} />);
      const btn = screen.getByLabelText('Attach image');
      expect(btn.hasAttribute('disabled')).toBe(false);
    });
  });

  describe('error handling', () => {
    it('shows error role="alert" when pasted text exceeds limit', () => {
      render(<Composer onSubmit={vi.fn()} />);
      const textarea = screen.getByRole('textbox', { name: /chat message input/i });

      const longText = 'a'.repeat(MAX_TEXT_CHARS + 100);
      fireEvent.paste(textarea, {
        clipboardData: {
          items: [] as DataTransferItem[],
          getData: () => longText,
        } as unknown as DataTransfer,
      });

      const alertEl = screen.queryByRole('alert');
      expect(alertEl).toBeTruthy();
      expect(alertEl!.textContent).toMatch(/clipped/i);
    });
  });

  describe('slash command menu integration', () => {
    it('does not render slash menu when typing plain text', () => {
      render(<Composer onSubmit={vi.fn()} />);
      expect(screen.queryByText(/Commands/)).toBeNull();
    });

    it('does not set aria-expanded when typing plain text', () => {
      render(<Composer onSubmit={vi.fn()} />);
      const textarea = screen.getByRole('textbox', { name: /chat message input/i });
      expect(textarea.getAttribute('aria-expanded')).toBe('false');
    });
  });
});
