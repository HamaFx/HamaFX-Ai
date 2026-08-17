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

import { describe, expect, it } from 'vitest';

import {
  OBSERVABILITY_EVENTS,
  OBSERVABILITY_TERMINAL_STATUSES,
  isObservabilityEventName,
  isObservabilityTerminalStatus,
  parseObservabilityEvent,
  parseObservabilitySpan,
} from '../src/observability';

describe('observability contracts', () => {
  it('contains the lifecycle events required by the AI and worker flows', () => {
    expect(OBSERVABILITY_EVENTS).toEqual(expect.arrayContaining([
      'job_queued',
      'job_claimed',
      'provider_fallback',
      'agent_started',
      'agent_failed',
      'tool_failed',
      'fusion_failed',
      'budget_release_failed',
      'run_completed',
      'run_failed',
    ]));
  });

  it('defines degraded completion separately from failure', () => {
    expect(OBSERVABILITY_TERMINAL_STATUSES).toContain('completed');
    expect(OBSERVABILITY_TERMINAL_STATUSES).toContain('completed_degraded');
    expect(OBSERVABILITY_TERMINAL_STATUSES).toContain('failed');
  });

  it('guards event names and terminal statuses at runtime', () => {
    expect(isObservabilityEventName('agent_failed')).toBe(true);
    expect(isObservabilityEventName('not-an-event')).toBe(false);
    expect(isObservabilityTerminalStatus('completed_degraded')).toBe(true);
    expect(isObservabilityTerminalStatus('running')).toBe(false);
  });

  it('validates the typed event envelope with zod at the boundary', () => {
    const event = parseObservabilityEvent({
      name: 'agent_failed',
      timestamp: 1_700_000_000_000,
      correlation: { traceId: 'trace-1', runId: 'run-1' },
      status: 'failed',
      agentName: 'decision',
      attempt: 2,
    });

    expect(event).toMatchObject({ name: 'agent_failed', agentName: 'decision', attempt: 2 });
    expect(event.correlation.traceId).toBe('trace-1');
  });

  it('rejects malformed event envelopes', () => {
    expect(() =>
      parseObservabilityEvent({ name: 'not-an-event', timestamp: 0, correlation: {} }),
    ).toThrow();
  });

  it('validates the typed span envelope and applies the default kind', () => {
    const span = parseObservabilitySpan({
      traceId: 'trace-1',
      spanId: 'span-1',
      name: 'tool:compute_risk',
      startTimeMs: 1000,
      durationMs: 42,
      status: 'completed',
      attributes: { toolName: 'compute_risk', costUsd: 0.0001 },
    });

    expect(span.kind).toBe('internal');
    expect(span.attributes?.toolName).toBe('compute_risk');
  });
});
