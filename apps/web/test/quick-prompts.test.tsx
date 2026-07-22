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
import { afterEach, describe, it, expect, vi } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { QuickPrompts } from '@/components/chat/quick-prompts';

afterEach(cleanup);

// Session-boundary timestamps (UTC)
// Asian:   00:00 – 07:00
// London:  07:00 – 12:00
// NY:      12:00 – 17:00
// Closed:  17:00 – 24:00
// Weekend: Friday 22:00 – Sunday 22:00

describe('QuickPrompts', () => {
  describe('session detection', () => {
    it('renders Asian session prompts at 03:00 UTC', () => {
      const now = new Date('2026-03-16T03:00:00Z'); // Monday 03:00 UTC → Asian
      render(<QuickPrompts onSelect={vi.fn()} now={now} />);
      // First prompt gets the session prefix: "Asian session is live — What's moving in Asia today?"
      expect(screen.getByText(/Asian session is live — What's moving in Asia today\?/)).toBeTruthy();
    });

    it('renders London session prompts at 09:00 UTC', () => {
      const now = new Date('2026-03-16T09:00:00Z'); // Monday 09:00 UTC → London
      render(<QuickPrompts onSelect={vi.fn()} now={now} />);
      expect(screen.getByText(/London open — bias on majors/i)).toBeTruthy();
    });

    it('renders NY session prompts at 15:00 UTC', () => {
      const now = new Date('2026-03-16T15:00:00Z'); // Monday 15:00 UTC → NY
      render(<QuickPrompts onSelect={vi.fn()} now={now} />);
      expect(screen.getByText(/NY session plan for XAUUSD/i)).toBeTruthy();
    });

    it('renders Closed session prompts at 20:00 UTC', () => {
      const now = new Date('2026-03-16T20:00:00Z'); // Monday 20:00 UTC → Closed
      render(<QuickPrompts onSelect={vi.fn()} now={now} />);
      expect(screen.getByText(/How did today close\?/i)).toBeTruthy();
    });

    it('renders Weekend prompts on Saturday', () => {
      const now = new Date('2026-03-14T12:00:00Z'); // Saturday 12:00 UTC → Weekend
      render(<QuickPrompts onSelect={vi.fn()} now={now} />);
      expect(screen.getByText(/Weekly bias — what is your read\?/i)).toBeTruthy();
    });
  });

  describe('pinnedSymbol', () => {
    it('renders XAUUSD-specific prompts when pinned', () => {
      const now = new Date('2026-03-16T09:00:00Z'); // London
      render(<QuickPrompts onSelect={vi.fn()} now={now} pinnedSymbol="XAUUSD" />);
      expect(screen.getByText(/London open bias for XAUUSD/i)).toBeTruthy();
    });

    it('renders EURUSD-specific prompts when pinned', () => {
      const now = new Date('2026-03-16T15:00:00Z'); // NY
      render(<QuickPrompts onSelect={vi.fn()} now={now} pinnedSymbol="EURUSD" />);
      expect(screen.getByText(/NY session plan for EURUSD/i)).toBeTruthy();
    });
  });

  describe('onSelect callback', () => {
    it('calls onSelect with the prefixed prompt text when a chip is clicked', () => {
      const onSelect = vi.fn();
      const now = new Date('2026-03-16T09:00:00Z'); // London
      render(<QuickPrompts onSelect={onSelect} now={now} />);

      // The first prompt label includes the session prefix
      fireEvent.click(screen.getByText(/London session is live — London open — bias on majors/i));
      expect(onSelect).toHaveBeenCalledTimes(1);
      expect(onSelect).toHaveBeenCalledWith('London session is live — London open — bias on majors?');
    });
  });

  describe('disabled state', () => {
    it('disables all buttons when disabled=true', () => {
      const now = new Date('2026-03-16T09:00:00Z'); // London
      render(<QuickPrompts onSelect={vi.fn()} now={now} disabled />);

      const buttons = screen.getAllByRole('button');
      expect(buttons.length).toBeGreaterThan(0);
      buttons.forEach((btn) => {
        expect(btn.hasAttribute('disabled')).toBe(true);
      });
    });

    it('does not call onSelect when disabled', () => {
      const onSelect = vi.fn();
      const now = new Date('2026-03-16T09:00:00Z'); // London
      render(<QuickPrompts onSelect={onSelect} now={now} disabled />);

      fireEvent.click(screen.getByText(/London open — bias on majors/i));
      expect(onSelect).not.toHaveBeenCalled();
    });
  });

  describe('session prefix in first prompt', () => {
    it('prepends "London session is live — " to the first prompt', () => {
      const now = new Date('2026-03-16T09:00:00Z');
      render(<QuickPrompts onSelect={vi.fn()} now={now} />);
      // The first prompt should have the prefix
      expect(screen.getByText(/London session is live — London open — bias on majors/i)).toBeTruthy();
    });

    it('prepends "NY session is live — " to the first prompt', () => {
      const now = new Date('2026-03-16T15:00:00Z');
      render(<QuickPrompts onSelect={vi.fn()} now={now} />);
      expect(screen.getByText(/NY session is live — NY session plan for XAUUSD/i)).toBeTruthy();
    });

    it('prepends "Asian session is live — " to the first prompt', () => {
      const now = new Date('2026-03-16T03:00:00Z');
      render(<QuickPrompts onSelect={vi.fn()} now={now} />);
      expect(screen.getByText(/Asian session is live — What's moving in Asia today\?/i)).toBeTruthy();
    });

    it('does not add prefix for Closed session', () => {
      const now = new Date('2026-03-16T20:00:00Z');
      render(<QuickPrompts onSelect={vi.fn()} now={now} />);
      expect(screen.getByText(/How did today close\?/i)).toBeTruthy();
      // Should not have any prefix since 'closed' has empty sessionPrefix
      const closedWithoutPrefix = screen.queryByText(/Closed session is live/i);
      expect(closedWithoutPrefix).toBeNull();
    });
  });

  describe('renders exactly 5 prompts', () => {
    it('renders 5 buttons for London session', () => {
      const now = new Date('2026-03-16T09:00:00Z');
      render(<QuickPrompts onSelect={vi.fn()} now={now} />);
      expect(screen.getAllByRole('button')).toHaveLength(5);
    });

    it('renders 5 buttons for London session with pinned symbol', () => {
      const now = new Date('2026-03-16T09:00:00Z');
      render(<QuickPrompts onSelect={vi.fn()} now={now} pinnedSymbol="XAUUSD" />);
      expect(screen.getAllByRole('button')).toHaveLength(5);
    });

    it('renders 5 buttons for Weekend', () => {
      const now = new Date('2026-03-14T12:00:00Z'); // Saturday
      render(<QuickPrompts onSelect={vi.fn()} now={now} />);
      expect(screen.getAllByRole('button')).toHaveLength(5);
    });
  });
});
