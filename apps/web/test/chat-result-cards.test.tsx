// @vitest-environment jsdom

import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

vi.mock('next-view-transitions', () => ({
  Link: ({ children, ...props }: React.ComponentProps<'a'>) => <a {...props}>{children}</a>,
}));

vi.mock('next/link', () => ({
  default: ({ children, ...props }: React.ComponentProps<'a'>) => <a {...props}>{children}</a>,
}));

import { GetPricePart } from '@/components/chat/parts/get-price';
import { AnalyzeTechnicalPart } from '@/components/chat/parts/analyze-technical';
import { GetNewsPart } from '@/components/chat/parts/get-news';
import { GetCalendarPart } from '@/components/chat/parts/get-calendar';

afterEach(cleanup);

const price = {
  ticks: [{ symbol: 'XAUUSD' as const, bid: 2320, ask: 2320.5, mid: 2320.25, ts: 1, source: 'test-feed' }],
  asOf: '2026-08-11T12:00:00.000Z',
};

const technical = {
  symbol: 'XAUUSD' as const,
  asOf: 1_754_000_000_000,
  partial: false,
  summary: 'Bullish structure with momentum confirmation.',
  perTimeframe: [{
    tf: '1h' as const,
    trend: 'up' as const,
    bias: 'bullish' as const,
    momentum: { rsi14: 62.4, macdHist: 0.12 },
    structure: { swingHigh: 2330, swingLow: 2300, latestStructureEvent: 'BOS_up' as const },
    levels: { pivot: 2310, r1: 2340, s1: 2290, atr14: 12 },
  }],
};

const news = {
  pipelinePending: false,
  items: [{
    id: 'n1', title: 'Gold rises as yields ease', summary: null, url: 'https://example.com/news', source: 'Wire', publisher: 'Example', publishedAt: 1_754_000_000_000,
    sentiment: 'positive' as const, sentimentScore: 0.7,
  }],
};

const calendar = {
  pipelinePending: false,
  items: [{
    id: 'e1', title: 'CPI YoY', country: 'US', currency: 'USD', importance: 'high' as const,
    date: 1_754_000_000_000, actual: null, forecast: 3.1, previous: 3, unit: '%', source: 'test',
  }],
};

describe('answer-first chat result cards', () => {
  it('puts the price answer and freshness metadata in a clear snapshot', () => {
    render(<GetPricePart output={price} state="done" />);
    expect(screen.getByRole('region', { name: 'Price snapshot' })).toBeTruthy();
    expect(screen.getByText('2320.25')).toBeTruthy();
    expect(screen.getByText('test-feed')).toBeTruthy();
    expect(screen.getByText(/Live|Recent|Stale/)).toBeTruthy();
  });

  it('shows the technical conclusion before timeframe evidence', () => {
    render(<AnalyzeTechnicalPart output={technical} state="done" />);
    expect(screen.getByRole('region', { name: /XAUUSD technical analysis/i })).toBeTruthy();
    expect(screen.getByText('Bullish structure with momentum confirmation.')).toBeTruthy();
    expect(screen.getByText('1h')).toBeTruthy();
  });

  it('shows news results with a result count', () => {
    render(<GetNewsPart output={news} state="done" />);
    expect(screen.getByRole('region', { name: /News results/i })).toBeTruthy();
    expect(screen.getByText('1 result')).toBeTruthy();
    expect(screen.getByText('Gold rises as yields ease')).toBeTruthy();
  });

  it('shows calendar results with impact and count', () => {
    render(<GetCalendarPart output={calendar} state="done" />);
    expect(screen.getByRole('region', { name: /Calendar results/i })).toBeTruthy();
    expect(screen.getByText('1 event')).toBeTruthy();
    expect(screen.getByText('High')).toBeTruthy();
  });
});
