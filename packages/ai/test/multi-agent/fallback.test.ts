/**
 * Copyright 2026 Kestrel
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
import { MultiAgentStrictFailureError } from '../../src/multi-agent/orchestrator';
import { ProgressTracker } from '../../src/multi-agent/stream';
import type { AgentOpinion, ResolvedMode } from '../../src/multi-agent/types';

describe('strict multi-agent failure handling', () => {
  it('keeps failed specialist progress and blocks the Decision agent', () => {
    const tracker = new ProgressTracker('full' as ResolvedMode, ['technical', 'fundamental', 'risk', 'sentiment']);
    tracker.update({ type: 'specialists_start', agents: ['technical', 'fundamental', 'risk', 'sentiment'] });
    tracker.update({ type: 'agent_start', agent: 'technical' });
    tracker.update({ type: 'agent_error', agent: 'technical', error: 'Model timeout' });
    tracker.update({ type: 'agent_start', agent: 'fundamental' });

    const opinion: AgentOpinion = {
      agentName: 'fundamental',
      bias: 'bullish',
      confidence: 0.7,
      reasoning: 'Fed dovish',
      rawData: {},
      costUsd: 0.01,
      latencyMs: 2000,
      model: 'm1',
    };
    tracker.update({ type: 'agent_done', agent: 'fundamental', opinion });
    tracker.update({
      type: 'analysis_error',
      stage: 'specialists',
      failedAgents: ['technical'],
      error: 'Full analysis stopped because a required specialist failed. No partial answer was returned.',
    });

    const part = tracker.buildPart();
    const agents = tracker.getAgents();
    const technical = agents.find((agent) => agent.agentName === 'technical');
    const fundamental = agents.find((agent) => agent.agentName === 'fundamental');
    const decision = agents.find((agent) => agent.agentName === 'decision');

    expect(technical?.status).toBe('error');
    expect(technical?.error).toBe('Model timeout');
    expect(fundamental?.status).toBe('done');
    expect(fundamental?.opinion).toBeDefined();
    expect(decision?.status).toBe('error');
    expect(part.data.status).toBe('failed');
    expect(part.data.error).toContain('No partial answer');
  });

  it('marks the complete run failed when all specialists fail', () => {
    const tracker = new ProgressTracker('full' as ResolvedMode, ['technical', 'fundamental', 'risk', 'sentiment']);
    tracker.update({ type: 'specialists_start', agents: ['technical', 'fundamental', 'risk', 'sentiment'] });
    tracker.update({ type: 'agent_error', agent: 'technical', error: 'Error 1' });
    tracker.update({ type: 'agent_error', agent: 'fundamental', error: 'Error 2' });
    tracker.update({ type: 'agent_error', agent: 'risk', error: 'Error 3' });
    tracker.update({ type: 'agent_error', agent: 'sentiment', error: 'Error 4' });
    tracker.update({
      type: 'analysis_error',
      stage: 'specialists',
      failedAgents: ['technical', 'fundamental', 'risk', 'sentiment'],
      error: 'Full analysis stopped because required specialists failed.',
    });

    const part = tracker.buildPart();
    const agents = tracker.getAgents();
    const errors = agents.filter((agent) => agent.status === 'error');

    expect(errors).toHaveLength(5);
    expect(part.data.status).toBe('failed');
  });

  it('does not treat partial specialist completion as a successful committee', () => {
    const tracker = new ProgressTracker('full' as ResolvedMode, ['technical', 'fundamental', 'risk', 'sentiment']);
    tracker.update({ type: 'specialists_start', agents: ['technical', 'fundamental', 'risk', 'sentiment'] });
    tracker.update({
      type: 'agent_done',
      agent: 'technical',
      opinion: {
        agentName: 'technical',
        bias: 'bullish',
        confidence: 0.8,
        reasoning: 'Up',
        rawData: {},
        costUsd: 0.01,
        latencyMs: 1000,
        model: 'm1',
      },
    });
    tracker.update({ type: 'agent_error', agent: 'fundamental', error: 'Timeout' });
    tracker.update({
      type: 'agent_done',
      agent: 'risk',
      opinion: {
        agentName: 'risk',
        bias: 'neutral',
        confidence: 0.5,
        reasoning: 'Moderate',
        rawData: { hardVeto: false },
        costUsd: 0.01,
        latencyMs: 1200,
        model: 'm2',
      },
    });
    tracker.update({ type: 'agent_error', agent: 'sentiment', error: 'API error' });
    tracker.update({
      type: 'analysis_error',
      stage: 'specialists',
      failedAgents: ['fundamental', 'sentiment'],
      error: 'Full analysis stopped because required specialists failed.',
    });

    const part = tracker.buildPart();
    const agents = tracker.getAgents();

    expect(agents.filter((agent) => agent.status === 'done')).toHaveLength(2);
    expect(agents.filter((agent) => agent.status === 'error')).toHaveLength(3);
    expect(part.data.status).toBe('failed');
  });

  it('represents strict failures without creating a partial response', () => {
    const error = new MultiAgentStrictFailureError('specialists', ['sentiment']);

    expect(error).toBeInstanceOf(Error);
    expect(error.code).toBe('MULTI_AGENT_INCOMPLETE');
    expect(error.stage).toBe('specialists');
    expect(error.failedAgents).toEqual(['sentiment']);
    expect(error.message).toContain('sentiment');
  });
});
