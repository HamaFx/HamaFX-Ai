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
import { afterEach, describe, it, expect } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { ToolCard } from '@/components/chat/parts/tool-card';

afterEach(cleanup);

const MOCK_INPUT = { symbol: 'XAUUSD' };

describe('ToolCard', () => {
  describe('rendering with different states', () => {
    it('renders the tool label for "tool-get_price"', () => {
      render(<ToolCard name="tool-get_price" state="output-available" input={MOCK_INPUT} output={{ ticks: [{ symbol: 'XAUUSD', mid: 2350.5 }] }} />);
      expect(screen.getByText('price')).toBeTruthy();
    });

    it('renders the tool label for "tool-get_candles"', () => {
      render(<ToolCard name="tool-get_candles" state="output-available" input={MOCK_INPUT} output={{ candles: [{}, {}, {}] }} />);
      expect(screen.getByText('candles')).toBeTruthy();
    });

    it('renders fallback label for an unknown tool', () => {
      render(<ToolCard name="tool-unknown_tool" state="output-available" input={MOCK_INPUT} output={{ result: 'ok' } as Record<string, unknown>} />);
      expect(screen.getByText('unknown tool')).toBeTruthy();
    });

    it('shows "running…" summary in input-streaming state', () => {
      render(<ToolCard name="tool-get_price" state="input-streaming" input={MOCK_INPUT} output={null} />);
      expect(screen.getByText(/running…/)).toBeTruthy();
    });

    it('shows "running…" summary in input-available state', () => {
      render(<ToolCard name="tool-get_price" state="input-available" input={MOCK_INPUT} output={null} />);
      expect(screen.getByText(/running…/)).toBeTruthy();
    });

    it('shows error text when state is output-error', () => {
      render(<ToolCard name="tool-get_price" state="output-error" input={MOCK_INPUT} output={null} errorText="API rate limited" />);
      expect(screen.getByText(/API rate limited/)).toBeTruthy();
    });

    it('shows generic "tool failed" when errorText is omitted', () => {
      render(<ToolCard name="tool-get_price" state="output-error" input={MOCK_INPUT} output={null} />);
      expect(screen.getByText(/tool failed/)).toBeTruthy();
    });
  });

  describe('expand/collapse behavior', () => {
    it('is collapsed by default', () => {
      const { container } = render(<ToolCard name="tool-get_price" state="output-available" input={MOCK_INPUT} output={{ ticks: [{ symbol: 'XAUUSD', mid: 2350.5 }] }} />);
      const inputLabel = container.querySelector('pre');
      expect(inputLabel).toBeNull();
    });

    it('expands to show input and output when clicked', () => {
      render(<ToolCard name="tool-get_price" state="output-available" input={MOCK_INPUT} output={{ ticks: [{ symbol: 'XAUUSD', mid: 2350.5 }] }} />);
      const toggleBtn = screen.getByRole('button', { expanded: false });
      fireEvent.click(toggleBtn);
      expect(screen.getByText('input')).toBeTruthy();
      expect(screen.getByText('output')).toBeTruthy();
      // 'XAUUSD' appears in input JSON and may also appear in output summary — use getAllByText
      const xauusdMatches = screen.getAllByText(/XAUUSD/);
      expect(xauusdMatches.length).toBeGreaterThanOrEqual(1);
    });

    it('collapses when clicked again', () => {
      render(<ToolCard name="tool-get_price" state="output-available" input={MOCK_INPUT} output={{ ticks: [{ symbol: 'XAUUSD', mid: 2350.5 }] }} />);
      const toggleBtn = screen.getByRole('button', { expanded: false });
      fireEvent.click(toggleBtn);
      expect(screen.getByText('input')).toBeTruthy();
      const collapseBtn = screen.getByRole('button', { expanded: true });
      fireEvent.click(collapseBtn);
      expect(screen.queryByText('input')).toBeNull();
    });

    it('shows error section instead of output when failed', () => {
      render(<ToolCard name="tool-get_price" state="output-error" input={MOCK_INPUT} output={null} errorText="Rate limited" />);
      const toggleBtn = screen.getByRole('button', { expanded: false });
      fireEvent.click(toggleBtn);
      expect(screen.getByText('error')).toBeTruthy();
      const rateLimitedMatches = screen.getAllByText(/Rate limited/);
      expect(rateLimitedMatches.length).toBeGreaterThanOrEqual(1);
    });

    it('has accessible aria-expanded and aria-controls attributes', () => {
      render(<ToolCard name="tool-get_price" state="output-available" input={MOCK_INPUT} output={{ price: 2350 } as Record<string, unknown>} />);
      const button = screen.getByRole('button');
      expect(button.getAttribute('aria-expanded')).toBe('false');
      expect(button.getAttribute('aria-controls')).toBeTruthy();
    });
  });

  describe('one-liner summary', () => {
    it('shows price for tool-get_price', () => {
      render(<ToolCard name="tool-get_price" state="output-available" input={MOCK_INPUT} output={{ ticks: [{ symbol: 'XAUUSD', mid: 2350.42 }] }} />);
      expect(screen.getByText(/XAUUSD 2350\.42/)).toBeTruthy();
    });

    it('shows bar count for tool-get_candles', () => {
      render(<ToolCard name="tool-get_candles" state="output-available" input={MOCK_INPUT} output={{ candles: Array.from({ length: 96 }) }} />);
      expect(screen.getByText(/96 bars/)).toBeTruthy();
    });

    it('shows indicator kinds for tool-get_indicators', () => {
      const output = { results: [{ kind: 'SMA' }, { kind: 'RSI' }, { kind: 'MACD' }] };
      render(<ToolCard name="tool-get_indicators" state="output-available" input={MOCK_INPUT} output={output} />);
      expect(screen.getByText(/SMA, RSI, MACD/)).toBeTruthy();
    });

    it('shows item count for news', () => {
      render(<ToolCard name="tool-get_news" state="output-available" input={MOCK_INPUT} output={{ items: Array.from({ length: 10 }) }} />);
      expect(screen.getByText(/10 items/)).toBeTruthy();
    });

    it('shows "pipeline not yet populated" for pipelinePending news', () => {
      render(<ToolCard name="tool-get_news" state="output-available" input={MOCK_INPUT} output={{ items: [], pipelinePending: true }} />);
      expect(screen.getByText(/pipeline not yet populated/)).toBeTruthy();
    });

    it('shows field count for an unknown tool output', () => {
      render(<ToolCard name="tool-unknown" state="output-available" input={MOCK_INPUT} output={{ a: 1, b: 2, c: 3 } as Record<string, unknown>} />);
      expect(screen.getByText(/3 fields/)).toBeTruthy();
    });
  });
});
