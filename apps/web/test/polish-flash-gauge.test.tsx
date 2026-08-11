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

import { act, cleanup, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { NewsArticle, Tick } from '@hamafx/shared';

import { SentimentSummary } from '@/app/(app)/news/_components/sentiment-summary';
import { WatchlistWidget } from '@/app/(app)/dashboard/_components/widgets/watchlist-widget';

afterEach(cleanup);

const root = resolve(process.cwd(), '../..');
const read = (relativePath: string) => readFileSync(resolve(root, relativePath), 'utf8');

// ---------------------------------------------------------------------------
// News sentiment gauge
// ---------------------------------------------------------------------------

function article(sentiment: NewsArticle['sentiment']): NewsArticle {
  return { sentiment } as unknown as NewsArticle;
}

describe('News sentiment gauge', () => {
  it('labels the pulse bullish when positives outweigh negatives', () => {
    render(
      <SentimentSummary
        articles={[article('positive'), article('positive'), article('negative')]}
      />,
    );
    // Appears as the header badge and as a counts label.
    expect(screen.getAllByText('Bullish').length).toBeGreaterThan(0);
  });

  it('labels the pulse bearish when negatives dominate', () => {
    render(
      <SentimentSummary
        articles={[article('negative'), article('negative'), article('positive')]}
      />,
    );
    expect(screen.getAllByText('Bearish').length).toBeGreaterThan(0);
  });

  it('stays neutral for an empty article list', () => {
    const { container } = render(<SentimentSummary articles={[]} />);
    expect(screen.getAllByText('Neutral').length).toBeGreaterThan(0);
    // The headline count is split across nested spans — read the block directly.
    const countP = container.querySelector('p.font-bold');
    expect(countP?.textContent).toMatch(/0\s+headlines/);
  });

  it('renders a decorative gauge and a real counts breakdown', () => {
    const { container } = render(
      <SentimentSummary
        articles={[article('positive'), article('negative'), article('neutral')]}
      />,
    );
    // The dial is purely presentational — wrapped in an aria-hidden container.
    const svg = container.querySelector('svg');
    expect(svg).toBeTruthy();
    expect(svg?.querySelectorAll('path').length).toBeGreaterThan(0);
    expect(svg?.querySelector('line')).toBeTruthy(); // needle

    // The accessible story lives in the counts list.
    const breakdown = screen.getByRole('list', { name: /sentiment breakdown/i });
    expect(breakdown.textContent).toContain('Bullish');
    expect(breakdown.textContent).toContain('Bearish');
    expect(breakdown.textContent).toContain('Neutral');
  });

  it('shows the untagged bucket only when uncategorized articles exist', () => {
    const { container } = render(
      <SentimentSummary articles={[article('positive'), article('positive')]} />,
    );
    expect(container.textContent).not.toContain('Untagged');

    cleanup();
    const { container: c2 } = render(
      <SentimentSummary articles={[article('positive'), article(null)]} />,
    );
    expect(c2.textContent).toContain('Untagged');
  });
});

// ---------------------------------------------------------------------------
// Watchlist live price flash
// ---------------------------------------------------------------------------

const usePricesMock = vi.hoisted(() => ({
  data: [] as unknown,
}));

vi.mock('@/hooks/use-prices', () => ({
  usePrices: () => ({
    data: usePricesMock.data,
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

function tick(symbol: string, mid: number): Tick {
  return {
    symbol,
    bid: mid - 0.1,
    ask: mid + 0.1,
    mid,
    ts: Date.now(),
    source: 'test',
  } as Tick;
}

describe('Watchlist live price flash', () => {
  it('renders a watchlist row with symbol and formatted price', () => {
    usePricesMock.data = [tick('XAUUSD', 2300.5)];
    render(<WatchlistWidget symbols={['XAUUSD']} />);
    expect(screen.getByText('XAUUSD')).toBeTruthy();
    expect(screen.getByText('2300.50')).toBeTruthy();
  });

  it('flashes green on an uptick and clears after the flash window', () => {
    vi.useFakeTimers();
    try {
      usePricesMock.data = [tick('XAUUSD', 2300.5)];
      const { rerender } = render(<WatchlistWidget symbols={['XAUUSD']} />);

      // Initial render: no flash.
      expect(screen.getByText('2300.50').className).not.toContain('bg-bull');

      // Price ticks up → green flash.
      usePricesMock.data = [tick('XAUUSD', 2301)];
      rerender(<WatchlistWidget symbols={['XAUUSD']} />);
      expect(screen.getByText('2301.00').className).toContain('bg-bull/15');

      // After the flash window the tint fades.
      act(() => {
        vi.advanceTimersByTime(700);
      });
      expect(screen.getByText('2301.00').className).not.toContain('bg-bull');
    } finally {
      vi.useRealTimers();
    }
  });

  it('flashes red on a downtick', () => {
    vi.useFakeTimers();
    try {
      usePricesMock.data = [tick('XAUUSD', 2301)];
      const { rerender } = render(<WatchlistWidget symbols={['XAUUSD']} />);

      usePricesMock.data = [tick('XAUUSD', 2300.5)];
      rerender(<WatchlistWidget symbols={['XAUUSD']} />);
      expect(screen.getByText('2300.50').className).toContain('bg-bear/15');
    } finally {
      vi.useRealTimers();
    }
  });
});

// ---------------------------------------------------------------------------
// Empty-state polish (source contracts)
// ---------------------------------------------------------------------------

describe('Empty-state polish', () => {
  it('journal entry list uses the shared EmptyState with contextual copy', () => {
    const src = read('apps/web/src/app/(app)/journal/_components/entry-list.tsx');
    expect(src).toContain('EmptyState');
    expect(src).toContain("title={isFiltered ? 'No entries match' : 'No entries yet'}");
    expect(src).toContain('Log your first trade');
  });

  it('alerts filtered-empty state offers a Show all action', () => {
    const src = read('apps/web/src/app/(app)/alerts/_components/alert-list.tsx');
    expect(src).toContain('Show all alerts');
    expect(src).toContain("setFilter('all')");
  });

  it('thread switcher renders a bare EmptyState for no matches', () => {
    const src = read('apps/web/src/components/chat/_components/thread-switcher.tsx');
    expect(src).toContain('EmptyState');
    expect(src).toContain('bare');
    expect(src).toContain('No other conversations');
    expect(src).toContain('No matches');
  });
});
