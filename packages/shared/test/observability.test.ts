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
});
