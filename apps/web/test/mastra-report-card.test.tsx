// @vitest-environment jsdom

import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { MastraReportCard, MastraReportPart } from '@/components/chat/parts/mastra-report';

afterEach(cleanup);

const baseMeta = {
  agent: 'mastra-xauusd' as const,
  runId: 'run-1',
  modelId: 'mistral-small-latest',
  providerId: 'mistral',
  researchStatus: 'ready' as const,
  dataQuality: 'partial' as const,
  packetId: 'packet-1',
  observedCost: 0.002,
  report: {
    symbol: 'XAUUSD' as const,
    asOf: '2026-08-18T12:00:00.000Z',
    dataQuality: 'partial' as const,
    bias: 'neutral' as const,
    confidence: 0.65,
    regime: 'mixed timeframe trend',
    bottomLine: 'Gold has mixed signals; wait for confirmation.',
    technicalSummary: 'Daily trend is firm while intraday momentum is mixed.',
    fundamentalSummary: 'Macro and news data were not collected in this run.',
    scenarios: [
      {
        name: 'Bullish continuation',
        direction: 'bullish' as const,
        trigger: 'Break above the recent high.',
        invalidation: 'Close below support.',
        targets: ['2450'],
        risks: ['False breakout'],
      },
      {
        name: 'Bearish rejection',
        direction: 'bearish' as const,
        trigger: 'Reject the recent high.',
        invalidation: 'Hold above resistance.',
        targets: ['2380'],
        risks: ['Short squeeze'],
      },
    ],
    contradictions: ['Daily and 15m trends disagree.'],
    missingData: ['News and macro context'],
    sources: [{
      evidenceId: 'price:XAUUSD',
      source: 'BiQuote',
      dataAsOf: '2026-08-18T11:59:00.000Z',
    }],
  },
};

describe('MastraReportCard', () => {
  it('shows the verified report, scenarios, warnings, and source details', () => {
    render(<MastraReportCard meta={baseMeta} />);

    expect(screen.getByRole('region', { name: 'Verified XAUUSD report' })).toBeTruthy();
    expect(screen.getByText('neutral')).toBeTruthy();
    expect(screen.getByText('Gold has mixed signals; wait for confirmation.')).toBeTruthy();
    expect(screen.getByText('Bullish continuation')).toBeTruthy();
    expect(screen.getByText('Bearish rejection')).toBeTruthy();
    expect(screen.getByText('partial data')).toBeTruthy();
    expect(screen.getByText('Warnings and limitations')).toBeTruthy();

    expect(screen.getByText('Sources and timestamps')).toBeTruthy();
  });

  it('shows a clear fail-closed message when research is blocked', () => {
    render(
      <MastraReportCard
        meta={{ ...baseMeta, researchStatus: 'blocked', report: null }}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent(/required market evidence was unavailable/i);
    expect(screen.queryByText('Bullish continuation')).toBeNull();
  });

  it('ignores malformed metadata instead of crashing the chat', () => {
    const { container } = render(<MastraReportPart data={{ agent: 'mastra-xauusd' }} />);
    expect(container.firstChild).toBeNull();
  });
});
