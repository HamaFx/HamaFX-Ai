// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSlashCommands } from '../src/hooks/use-slash-commands';

const TEST_COMMANDS = [
  { command: '/chart', description: 'Open chart', placeholder: '/chart XAUUSD' },
  { command: '/journal', description: 'Log trade', placeholder: '/journal buy' },
  { command: '/settings', description: 'Settings', placeholder: '/settings', action: 'navigate' as const, href: '/settings' },
] as const;

function createMockTextarea(): HTMLTextAreaElement {
  const el = document.createElement('textarea');
  el.setSelectionRange = vi.fn();
  return el;
}

describe('useSlashCommands', () => {
  let setValue: ReturnType<typeof vi.fn>;
  let textarea: HTMLTextAreaElement;
  let textareaRef: React.RefObject<HTMLTextAreaElement | null>;

  beforeEach(() => {
    setValue = vi.fn();
    textarea = createMockTextarea();
    textareaRef = { current: textarea };
  });

  function render(value: string) {
    return renderHook(() =>
      useSlashCommands({ value, setValue, textareaRef, commands: TEST_COMMANDS }),
    );
  }

  describe('slash detection', () => {
    it('detects slash command when value starts with /', () => {
      const { result } = render('/char');
      expect(result.current.slashActive).toBe(true);
    });

    it('does not detect slash when value is plain text', () => {
      const { result } = render('hello');
      expect(result.current.slashActive).toBe(false);
    });

    it('does not detect slash when value is empty', () => {
      const { result } = render('');
      expect(result.current.slashActive).toBe(false);
    });

    it('does not detect slash for long values (>40 chars)', () => {
      const { result } = render('/' + 'a'.repeat(40));
      expect(result.current.slashActive).toBe(false);
    });
  });

  describe('filtering', () => {
    it('shows all commands when query is empty', () => {
      const { result } = render('/');
      expect(result.current.filteredCommands).toHaveLength(3);
    });

    it('filters commands by prefix', () => {
      const { result } = render('/char');
      expect(result.current.filteredCommands).toHaveLength(1);
      expect(result.current.filteredCommands[0].command).toBe('/chart');
    });

    it('shows no commands when no match', () => {
      const { result } = render('/xyz');
      expect(result.current.filteredCommands).toHaveLength(0);
    });
  });

  function makeKeyEvent(key: string): React.KeyboardEvent<HTMLTextAreaElement> {
    return { key, preventDefault: vi.fn() } as unknown as React.KeyboardEvent<HTMLTextAreaElement>;
  }

  describe('keyboard navigation', () => {
    it('ArrowDown moves slashIndex forward', () => {
      const { result } = render('/');
      expect(result.current.slashIndex).toBe(-1);
      act(() => {
        result.current.handleSlashKeyDown(makeKeyEvent('ArrowDown'));
      });
      expect(result.current.slashIndex).toBe(0);
    });

    it('ArrowUp wraps to the end', () => {
      const { result } = render('/');
      act(() => {
        result.current.handleSlashKeyDown(makeKeyEvent('ArrowUp'));
      });
      expect(result.current.slashIndex).toBe(2);
    });

    it('Escape resets slashIndex', () => {
      const { result } = render('/');
      act(() => {
        result.current.handleSlashKeyDown(makeKeyEvent('ArrowDown'));
      });
      expect(result.current.slashIndex).toBe(0);
      act(() => {
        result.current.handleSlashKeyDown(makeKeyEvent('Escape'));
      });
      expect(result.current.slashIndex).toBe(-1);
    });

    it('returns false for non-slash keys when slash is not active', () => {
      const { result } = render('hello');
      const event = makeKeyEvent('ArrowDown');
      expect(result.current.handleSlashKeyDown(event)).toBe(false);
    });
  });

  describe('selectSlashCommand', () => {
    it('selects a command and sets the placeholder', () => {
      const { result } = render('/char');
      act(() => {
        result.current.selectSlashCommand(TEST_COMMANDS[0]);
      });
      expect(setValue).toHaveBeenCalledWith('/chart XAUUSD');
    });

    it('navigates when action is navigate', () => {
      const { result } = render('/set');
      const originalLocation = window.location;
      // @ts-expect-error mocking location
      delete window.location;
      window.location = { href: '' } as Location;

      act(() => {
        result.current.selectSlashCommand(TEST_COMMANDS[2]);
      });
      expect(window.location.href).toBe('/settings');

      window.location = originalLocation;
    });
  });

  describe('handleSlashChange', () => {
    it('calls setValue with the new value', () => {
      const { result } = render('/');
      act(() => {
        result.current.handleSlashChange('/chart');
      });
      expect(setValue).toHaveBeenCalledWith('/chart');
    });

    it('resets slashIndex when value no longer starts with /', () => {
      const { result } = render('/');
      // First set slashIndex
      act(() => {
        result.current.setSlashIndex(0);
      });
      expect(result.current.slashIndex).toBe(0);

      act(() => {
        result.current.handleSlashChange('hello');
      });
      expect(result.current.slashIndex).toBe(-1);
    });
  });
});
