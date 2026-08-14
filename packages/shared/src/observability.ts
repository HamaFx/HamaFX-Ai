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

/**
 * Shared observability contracts.
 *
 * Keep these values independent from any vendor SDK so application logs,
 * durable diagnostics, OpenTelemetry, and Langfuse can all describe the
 * same run without inventing incompatible event names.
 */

/** Correlation fields that may be propagated across web, worker, and AI code. */
export interface ObservabilityCorrelation {
  traceId?: string;
  requestId?: string;
  runId?: string;
  jobId?: string;
  threadId?: string;
  messageId?: string;
  userId?: string;
}

/** Stable lifecycle events emitted by AI and queued-analysis flows. */
export const OBSERVABILITY_EVENTS = [
  'request_received',
  'mode_resolved',
  'job_queued',
  'job_claimed',
  'context_started',
  'context_completed',
  'provider_attempt_started',
  'provider_attempt_failed',
  'provider_fallback',
  'agent_started',
  'agent_completed',
  'agent_failed',
  'tool_started',
  'tool_completed',
  'tool_failed',
  'fusion_started',
  'fusion_completed',
  'fusion_failed',
  'persistence_started',
  'persistence_completed',
  'budget_reserved',
  'budget_reconciled',
  'budget_release_failed',
  'run_completed',
  'run_failed',
] as const;

export type ObservabilityEventName = (typeof OBSERVABILITY_EVENTS)[number];

/** Terminal states shared by synchronous and queued AI runs. */
export const OBSERVABILITY_TERMINAL_STATUSES = [
  'completed',
  'completed_degraded',
  'failed',
  'cancelled',
  'expired',
] as const;

export type ObservabilityTerminalStatus = (typeof OBSERVABILITY_TERMINAL_STATUSES)[number];

/**
 * Vendor-neutral event envelope used by durable diagnostics and trace
 * adapters. Optional fields are populated when relevant to the event.
 */
export interface ObservabilityEvent {
  name: ObservabilityEventName;
  timestamp: number;
  correlation: ObservabilityCorrelation;
  status?: ObservabilityTerminalStatus;
  operation?: string;
  errorCode?: string;
  attempt?: number;
  providerId?: string;
  modelId?: string;
  agentName?: string;
  metadata?: Record<string, unknown>;
}

export function isObservabilityEventName(value: string): value is ObservabilityEventName {
  return (OBSERVABILITY_EVENTS as readonly string[]).includes(value);
}

export function isObservabilityTerminalStatus(value: string): value is ObservabilityTerminalStatus {
  return (OBSERVABILITY_TERMINAL_STATUSES as readonly string[]).includes(value);
}
