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

describe('ProgressTracker', () => {
  it('initializes all agents as pending', () => {
    const tracker = new ProgressTracker('full' as ResolvedMode, ['technical', 'fundamental', 'risk', 'sentiment']);
    const part = tracker.buildPart();
    expect(part.type).toBe('data-agent-progress');
    expect(part.data.mode).toBe('full');
    expect(part.data.agents).toHaveLength(5);
    expect(part.data.agents.map((a) => a.status).every((s) => s === 'pending')).toBe(true);
  });

  it('updates agent status on progress events', () => {
    const tracker = new ProgressTracker('quick' as ResolvedMode, ['technical']);
    tracker.update({ type: 'specialists_start', agents: ['technical'] });
    tracker.update({ type: 'agent_start', agent: 'technical' });
    let part = tracker.buildPart();
    expect(part.data.agents.find((a) => a.agentName === 'technical')!.status).toBe('running');
    const opinion: AgentOpinion = { agentName: 'technical', bias: 'bullish', confidence: 0.8, reasoning: 'Strong uptrend', rawData: {}, costUsd: 0.01, latencyMs: 1200, model: 'google/gemini-2.5-flash' };
    tracker.update({ type: 'agent_done', agent: 'technical', opinion });
    tracker.update({ type: 'fusion_start' });
    part = tracker.buildPart();
    expect(part.data.agents.find((a) => a.agentName === 'technical')!.status).toBe('done');
    expect(part.data.agents.find((a) => a.agentName === 'decision')!.status).toBe('running');
  });

  it('handles agent errors', () => {
    const tracker = new ProgressTracker('standard' as ResolvedMode, ['technical', 'fundamental']);
    tracker.update({ type: 'agent_start', agent: 'fundamental' });
    tracker.update({ type: 'agent_error', agent: 'fundamental', error: 'Model timeout' });
    const part = tracker.buildPart();
    expect(part.data.agents.find((a) => a.agentName === 'fundamental')!.status).toBe('error');
  });

  it('marks decision as done on fusion_done', () => {
    const tracker = new ProgressTracker('quick' as ResolvedMode, ['technical']);
    tracker.update({ type: 'fusion_start' });
    tracker.update({ type: 'fusion_done' });
    expect(tracker.buildPart().data.agents.find((a) => a.agentName === 'decision')!.status).toBe('done');
  });
});