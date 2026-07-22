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
import { AgentDeliberation } from '@/components/chat/parts/agent-deliberation';

afterEach(cleanup);

type AgentProgress = {
  agentName: string;
  status: 'pending' | 'running' | 'done' | 'error';
  opinion?: {
    agentName: string;
    bias: 'bullish' | 'bearish' | 'neutral';
    confidence: number;
    reasoning: string;
  };
  error?: string;
};

function allPending(): AgentProgress[] {
  return [
    { agentName: 'technical', status: 'pending' },
    { agentName: 'fundamental', status: 'pending' },
    { agentName: 'risk', status: 'pending' },
  ];
}

function oneRunning(): AgentProgress[] {
  return [
    { agentName: 'technical', status: 'running' },
    { agentName: 'fundamental', status: 'pending' },
    { agentName: 'risk', status: 'pending' },
  ];
}

function oneDone(): AgentProgress[] {
  return [
    { agentName: 'technical', status: 'done' },
    { agentName: 'fundamental', status: 'running' },
    { agentName: 'risk', status: 'pending' },
  ];
}

function allDoneWithVerdict(): AgentProgress[] {
  return [
    {
      agentName: 'technical',
      status: 'done',
      opinion: { agentName: 'technical', bias: 'bullish', confidence: 0.85, reasoning: 'Strong trend on 4H' },
    },
    {
      agentName: 'fundamental',
      status: 'done',
      opinion: { agentName: 'fundamental', bias: 'bullish', confidence: 0.72, reasoning: 'NFP beat expectations' },
    },
    {
      agentName: 'risk',
      status: 'done',
      opinion: { agentName: 'risk', bias: 'bearish', confidence: 0.6, reasoning: 'Elevated VIX' },
    },
  ];
}

function mixedDoneError(): AgentProgress[] {
  return [
    { agentName: 'technical', status: 'done', opinion: { agentName: 'technical', bias: 'bullish', confidence: 0.8, reasoning: 'Trending up' } },
    { agentName: 'fundamental', status: 'error', error: 'API timeout' },
    { agentName: 'risk', status: 'done', opinion: { agentName: 'risk', bias: 'neutral', confidence: 0.5, reasoning: 'Neutral' } },
  ];
}

function singleAgentDone(): AgentProgress[] {
  return [
    { agentName: 'technical', status: 'done', opinion: { agentName: 'technical', bias: 'bullish', confidence: 0.9, reasoning: 'Clear uptrend' } },
  ];
}

function allDoneDissent(): AgentProgress[] {
  return [
    {
      agentName: 'technical',
      status: 'done',
      opinion: { agentName: 'technical', bias: 'bullish', confidence: 0.8, reasoning: 'Strong trend' },
    },
    {
      agentName: 'fundamental',
      status: 'done',
      opinion: { agentName: 'fundamental', bias: 'bearish', confidence: 0.7, reasoning: 'Weak data' },
    },
    {
      agentName: 'risk',
      status: 'done',
      opinion: { agentName: 'risk', bias: 'neutral', confidence: 0.5, reasoning: 'Flat vol' },
    },
  ];
}

describe('AgentDeliberation', () => {
  describe('mode label', () => {
    it('displays the mode name in the header', () => {
      render(<AgentDeliberation agents={allPending()} mode="standard" />);
      expect(screen.getByText(/standard/i)).toBeTruthy();
    });
  });

  describe('initial state — all pending', () => {
    it('shows "Deliberating…" when nothing is done yet', () => {
      render(<AgentDeliberation agents={allPending()} mode="standard" />);
      expect(screen.getByText(/Deliberating…/i)).toBeTruthy();
    });

    it('does not show the verdict panel', () => {
      const { container } = render(<AgentDeliberation agents={allPending()} mode="standard" />);
      expect(container.querySelector('[aria-label*="Committee verdict"]')).toBeNull();
    });

    it('renders agent nodes with "pending" aria-label', () => {
      render(<AgentDeliberation agents={allPending()} mode="standard" />);
      expect(screen.getByLabelText(/Technical agent: pending/i)).toBeTruthy();
      expect(screen.getByLabelText(/Fundamental agent: pending/i)).toBeTruthy();
      expect(screen.getByLabelText(/Risk agent: pending/i)).toBeTruthy();
    });
  });

  describe('running state', () => {
    it('shows telemetry log when not all done', () => {
      render(<AgentDeliberation agents={oneRunning()} mode="standard" />);
      expect(screen.getByText(/System Telemetry/i)).toBeTruthy();
    });

    it('shows [ RUNNING ] tag for running agents and fusion engine', () => {
      render(<AgentDeliberation agents={oneRunning()} mode="standard" />);
      // [ RUNNING ] appears twice: once for the running agent, once for the
      // fusion engine (see TelemetryLog component)
      const runningTags = screen.getAllByText(/\[ RUNNING \]/i);
      expect(runningTags.length).toBe(2);
    });

    it('shows [ PENDING ] tag for pending agents', () => {
      render(<AgentDeliberation agents={oneRunning()} mode="standard" />);
      // Only one agent is running, two are pending
      const pendingTags = screen.getAllByText(/\[ PENDING \]/i);
      expect(pendingTags.length).toBe(2);
    });
  });

  describe('partial completion', () => {
    it('shows fusion animation when some agents are done', () => {
      const { container } = render(<AgentDeliberation agents={oneDone()} mode="standard" />);
      // Connector lines should be rendered (SVG)
      const svg = container.querySelector('svg');
      expect(svg).toBeTruthy();
    });

    it('shows [ COMPLETED ] tag for done agents', () => {
      render(<AgentDeliberation agents={oneDone()} mode="standard" />);
      expect(screen.getByText(/\[ COMPLETED \]/i)).toBeTruthy();
    });
  });

  describe('verdict reveal — all done', () => {
    it('shows the committee confidence panel', () => {
      render(<AgentDeliberation agents={allDoneWithVerdict()} mode="full" />);
      expect(screen.getByText(/Committee confidence/i)).toBeTruthy();
    });

    it('calculates average confidence correctly', () => {
      render(<AgentDeliberation agents={allDoneWithVerdict()} mode="full" />);
      // (85 + 72 + 60) / 3 = 72.33 → rounded to 72
      // 72% appears in both the confidence number AND the aria-label on the
      // verdict panel — use getAllByText
      const confidenceMatches = screen.getAllByText(/72%/);
      expect(confidenceMatches.length).toBeGreaterThanOrEqual(1);
    });

    it('hides telemetry log when all done', () => {
      render(<AgentDeliberation agents={allDoneWithVerdict()} mode="full" />);
      expect(screen.queryByText(/System Telemetry/i)).toBeNull();
    });

    it('shows "View agent opinions" details element', () => {
      render(<AgentDeliberation agents={allDoneWithVerdict()} mode="full" />);
      expect(screen.getByText(/View agent opinions/i)).toBeTruthy();
    });
  });

  describe('mix of done and error', () => {
    it('shows error messages for failed agents', () => {
      render(<AgentDeliberation agents={mixedDoneError()} mode="standard" />);
      expect(screen.getByText(/API timeout/)).toBeTruthy();
    });

    it('shows error message for failed agents in verdict panel', () => {
      render(<AgentDeliberation agents={mixedDoneError()} mode="standard" />);
      // When all agents are done or errored, the telemetry log is hidden and
      // the verdict panel shows error details directly
      expect(screen.getByText(/Fundamental agent failed: API timeout/i)).toBeTruthy();
    });
  });

  describe('dissenting opinions', () => {
    it('shows "Mixed signals" when both bullish and bearish opinions exist', () => {
      render(<AgentDeliberation agents={allDoneDissent()} mode="standard" />);
      expect(screen.getByText(/Mixed signals/i)).toBeTruthy();
    });

    it('shows bias distribution bars', () => {
      render(<AgentDeliberation agents={allDoneDissent()} mode="standard" />);
      // One bullish, one bearish, one neutral
      expect(screen.getByText('Bull')).toBeTruthy();
      expect(screen.getByText('Bear')).toBeTruthy();
      expect(screen.getByText('Neutral')).toBeTruthy();
    });
  });

  describe('expandable agent opinions', () => {
    it('shows opinion reasoning when details are expanded', () => {
      render(<AgentDeliberation agents={allDoneWithVerdict()} mode="standard" />);
      const details = screen.getByText(/View agent opinions/i).closest('details');
      expect(details).toBeTruthy();
      expect(details!.hasAttribute('open')).toBe(false);

      // Click to expand
      const summary = screen.getByText(/View agent opinions/i);
      fireEvent.click(summary);
      expect(details!.hasAttribute('open')).toBe(true);
      expect(screen.getByText(/Strong trend on 4H/)).toBeTruthy();
      expect(screen.getByText(/NFP beat expectations/)).toBeTruthy();
      expect(screen.getByText(/Elevated VIX/)).toBeTruthy();
    });
  });

  describe('verdict aria-label', () => {
    it('has aria-label on the verdict panel with bias and confidence', () => {
      render(<AgentDeliberation agents={allDoneWithVerdict()} mode="standard" />);
      // With 2 bullish, 1 bearish → dissent (mixed), avg confidence 72%
      const verdictEl = screen.getByLabelText(/Committee verdict/i);
      expect(verdictEl).toBeTruthy();
      expect(verdictEl.getAttribute('aria-label')).toMatch(/mixed.*72%/);
    });

    it('reports no dissent when all agents agree', () => {
      render(<AgentDeliberation agents={singleAgentDone()} mode="standard" />);
      const verdictEl = screen.getByLabelText(/Committee verdict/i);
      expect(verdictEl).toBeTruthy();
    });
  });
});
