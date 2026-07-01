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

// Multi-Agent Orchestration — SSE streaming for multi-agent progress.

import type { ProgressEvent, AgentOpinion, ResolvedMode } from './types';

export interface AgentProgressPart {
  type: 'data-agent-progress';
  data: {
    agents: Array<{ agentName: string; status: 'pending' | 'running' | 'done' | 'error'; opinion?: AgentOpinion; error?: string }>;
    mode: ResolvedMode;
  };
}

export class ProgressTracker {
  private agents: Map<string, { status: 'pending' | 'running' | 'done' | 'error'; opinion?: AgentOpinion; error?: string }> = new Map();
  private mode: ResolvedMode;

  constructor(mode: ResolvedMode, agentNames: string[]) {
    this.mode = mode;
    for (const name of agentNames) this.agents.set(name, { status: 'pending' });
    this.agents.set('decision', { status: 'pending' });
  }

  update(event: ProgressEvent): void {
    switch (event.type) {
      case 'specialists_start':
        for (const name of event.agents) this.agents.set(name, { status: 'pending' });
        break;
      case 'agent_start':
        this.agents.set(event.agent, { status: 'running' });
        break;
      case 'agent_done':
        this.agents.set(event.agent, { status: 'done', opinion: event.opinion });
        break;
      case 'agent_error':
        this.agents.set(event.agent, { status: 'error', error: event.error });
        break;
      case 'fusion_start':
        this.agents.set('decision', { status: 'running' });
        break;
      case 'fusion_done':
        this.agents.set('decision', { status: 'done' });
        break;
    }
  }

  buildPart(): AgentProgressPart {
    return {
      type: 'data-agent-progress',
      data: {
        agents: Array.from(this.agents.entries()).map(([name, state]) => ({
          agentName: name, status: state.status,
          ...(state.opinion ? { opinion: state.opinion } : {}),
          ...(state.error ? { error: state.error } : {}),
        })),
        mode: this.mode,
      },
    };
  }

  getAgents(): Array<{ agentName: string; status: string; opinion?: AgentOpinion; error?: string }> {
    return Array.from(this.agents.entries()).map(([name, state]) => ({
      agentName: name, status: state.status,
      ...(state.opinion ? { opinion: state.opinion } : {}),
      ...(state.error ? { error: state.error } : {}),
    }));
  }
}

export function progressToSSE(event: ProgressEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

export function createMultiAgentStreamResponse(progressEvents: ProgressEvent[], finalText: string, _mode: ResolvedMode): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      for (const event of progressEvents) controller.enqueue(encoder.encode(progressToSSE(event)));
      const textPart = `data: ${JSON.stringify({ type: 'text', text: finalText })}\n\n`;
      controller.enqueue(encoder.encode(textPart));
      controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      controller.close();
    },
  });
  return new Response(stream, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' } });
}