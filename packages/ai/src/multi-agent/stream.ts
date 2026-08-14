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

// Multi-Agent Orchestration — SSE streaming for multi-agent progress.

import type { ProgressEvent, AgentOpinion, ResolvedMode } from './types';

export interface AgentProgressPart {
  type: 'data-agent-progress';
  data: {
    agents: Array<{ agentName: string; status: 'pending' | 'running' | 'done' | 'error'; opinion?: AgentOpinion; error?: string }>;
    mode: ResolvedMode;
    status?: 'complete' | 'failed' | 'retrying';
    error?: string;
  };
}

export class ProgressTracker {
  private agents: Map<string, { status: 'pending' | 'running' | 'done' | 'error'; opinion?: AgentOpinion; error?: string }> = new Map();
  private mode: ResolvedMode;
  private terminalStatus: 'complete' | 'failed' | 'retrying' | undefined;
  private terminalError: string | undefined;

  constructor(mode: ResolvedMode, agentNames: string[]) {
    this.mode = mode;
    for (const name of agentNames) this.agents.set(name, { status: 'pending' });
    this.agents.set('decision', { status: 'pending' });
  }

  update(event: ProgressEvent): void {
    switch (event.type) {
      case 'specialists_start':
        // Rebuild the set from the orchestrator's effective specialist list.
        // Explicit Full mode is never downgraded; this also prevents stale
        // agents from remaining visible as permanently pending after retries.
        this.agents = new Map(event.agents.map((name) => [name, { status: 'pending' as const }]));
        this.agents.set('decision', { status: 'pending' });
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
        this.terminalStatus = 'complete';
        this.terminalError = undefined;
        break;
      case 'fusion_error':
        this.agents.set('decision', { status: 'error', error: event.error });
        break;
      case 'analysis_error':
        this.terminalStatus = 'failed';
        this.terminalError = event.error;
        if (this.agents.get('decision')?.status !== 'done') {
          this.agents.set('decision', { status: 'error', error: event.error });
        }
        break;
      case 'analysis_retry':
        this.terminalStatus = 'retrying';
        this.terminalError = event.error;
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
        ...(this.terminalStatus ? { status: this.terminalStatus } : {}),
        ...(this.terminalError ? { error: this.terminalError } : {}),
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