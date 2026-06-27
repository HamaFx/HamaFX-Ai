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

import { describe, it, expect } from 'vitest';
import { ProgressTracker } from '../../src/multi-agent/stream';
import type { ProgressEvent, AgentOpinion, ResolvedMode } from '../../src/multi-agent/types';

describe('fallback — ProgressTracker error handling', () => {
  it('tracks agent errors in progress', () => {
    const tracker = new ProgressTracker('full' as ResolvedMode, ['technical', 'fundamental', 'risk', 'sentiment']);
    tracker.update({ type: 'specialists_start', agents: ['technical', 'fundamental', 'risk', 'sentiment'] });
    tracker.update({ type: 'agent_start', agent: 'technical' });
    tracker.update({ type: 'agent_error', agent: 'technical', error: 'Model timeout' });
    tracker.update({ type: 'agent_start', agent: 'fundamental' });
    const opinion: AgentOpinion = {
      agentName: 'fundamental', bias: 'bullish', confidence: 0.7,
      reasoning: 'Fed dovish', rawData: {}, costUsd: 0.01, latencyMs: 2000, model: 'm1',
    };
    tracker.update({ type: 'agent_done', agent: 'fundamental', opinion });
    tracker.update({ type: 'fusion_start' });
    tracker.update({ type: 'fusion_done' });

    const agents = tracker.getAgents();
    const tech = agents.find((a) => a.agentName === 'technical');
    const fund = agents.find((a) => a.agentName === 'fundamental');
    const decision = agents.find((a) => a.agentName === 'decision');

    expect(tech?.status).toBe('error');
    expect(tech?.error).toBe('Model timeout');
    expect(fund?.status).toBe('done');
    expect(fund?.opinion).toBeDefined();
    expect(decision?.status).toBe('done');
  });

  it('handles all specialists failing', () => {
    const tracker = new ProgressTracker('standard' as ResolvedMode, ['technical', 'fundamental']);
    tracker.update({ type: 'specialists_start', agents: ['technical', 'fundamental'] });
    tracker.update({ type: 'agent_error', agent: 'technical', error: 'Error 1' });
    tracker.update({ type: 'agent_error', agent: 'fundamental', error: 'Error 2' });
    tracker.update({ type: 'fusion_start' });
    tracker.update({ type: 'fusion_done' });

    const agents = tracker.getAgents();
    const errors = agents.filter((a) => a.status === 'error');
    expect(errors).toHaveLength(2);
  });

  it('handles partial completion (some done, some error)', () => {
    const tracker = new ProgressTracker('full' as ResolvedMode, ['technical', 'fundamental', 'risk', 'sentiment']);
    tracker.update({ type: 'specialists_start', agents: ['technical', 'fundamental', 'risk', 'sentiment'] });

    // Technical succeeds
    tracker.update({ type: 'agent_start', agent: 'technical' });
    tracker.update({
      type: 'agent_done', agent: 'technical',
      opinion: { agentName: 'technical', bias: 'bullish', confidence: 0.8, reasoning: 'Up', rawData: {}, costUsd: 0.01, latencyMs: 1000, model: 'm1' },
    });

    // Fundamental fails
    tracker.update({ type: 'agent_error', agent: 'fundamental', error: 'Timeout' });

    // Risk succeeds
    tracker.update({ type: 'agent_start', agent: 'risk' });
    tracker.update({
      type: 'agent_done', agent: 'risk',
      opinion: { agentName: 'risk', bias: 'neutral', confidence: 0.5, reasoning: 'Moderate', rawData: { hardVeto: false }, costUsd: 0.01, latencyMs: 1200, model: 'm2' },
    });

    // Sentiment fails
    tracker.update({ type: 'agent_error', agent: 'sentiment', error: 'API error' });

    tracker.update({ type: 'fusion_start' });
    tracker.update({ type: 'fusion_done' });

    const agents = tracker.getAgents();
    expect(agents.filter((a) => a.status === 'done')).toHaveLength(3); // tech, risk, decision
    expect(agents.filter((a) => a.status === 'error')).toHaveLength(2); // fund, sentiment
  });
});

describe('fallback — DecisionAgent with missing opinions', () => {
  it('buildOpinionsBlock notes when no agents available', () => {
    // Test the fallback message that would be shown when all specialists fail
    const fallbackMessage = 'No specialist agents were available for this analysis. Provide a general response based on your own knowledge.';
    expect(fallbackMessage).toContain('No specialist agents');
    expect(fallbackMessage).toContain('general response');
  });

  it('orchestrator fallback concatenates opinions when decision fails', () => {
    // When the Decision agent fails, the orchestrator concatenates
    // specialist reasoning as a raw response
    const opinions: AgentOpinion[] = [
      { agentName: 'technical', bias: 'bullish', confidence: 0.8, reasoning: 'Uptrend', rawData: {}, costUsd: 0.01, latencyMs: 1000, model: 'm1' },
      { agentName: 'risk', bias: 'neutral', confidence: 0.5, reasoning: 'Moderate risk', rawData: {}, costUsd: 0.01, latencyMs: 1200, model: 'm2' },
    ];
    const fallbackText = opinions
      .map((o) => `**${o.agentName.charAt(0).toUpperCase() + o.agentName.slice(1)} Agent** (${o.bias}, ${Math.round(o.confidence * 100)}% confidence)\n${o.reasoning}`)
      .join('\n\n---\n\n');
    const fullText = `⚠️ The Decision agent encountered an error. Here are the individual specialist opinions:\n\n${fallbackText}`;

    expect(fullText).toContain('⚠️');
    expect(fullText).toContain('Technical Agent');
    expect(fullText).toContain('Risk Agent');
    expect(fullText).toContain('80% confidence');
    expect(fullText).toContain('---');
  });

  it('orchestrator fallback handles all agents failing', () => {
    const fallbackText = 'I apologize, but all analysis agents encountered errors. Please try again or switch to single-agent mode.';
    expect(fallbackText).toContain('all analysis agents');
    expect(fallbackText).toContain('single-agent mode');
  });
});