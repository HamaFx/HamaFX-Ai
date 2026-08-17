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

import { z } from 'zod';

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

/**
 * Phase D — typed event/span envelopes.
 *
 * The `ObservabilityEvent` interface above documents the contract, but the
 * project's "Zod at Boundaries" rule means every shape crossing a package
 * boundary must also validate at runtime. These schemas make the event and
 * span envelopes enforceable so web, worker, durable diagnostics, and trace
 * adapters cannot silently drift apart.
 */
const observabilityCorrelationSchema = z
  .object({
    traceId: z.string().optional(),
    requestId: z.string().optional(),
    runId: z.string().optional(),
    jobId: z.string().optional(),
    threadId: z.string().optional(),
    messageId: z.string().optional(),
    userId: z.string().optional(),
  })
  .passthrough();

/** Runtime-validated event envelope (matches `ObservabilityEvent`). */
export const observabilityEventSchema = z.object({
  name: z.enum(OBSERVABILITY_EVENTS),
  timestamp: z.number().int().nonnegative(),
  correlation: observabilityCorrelationSchema,
  status: z.enum(OBSERVABILITY_TERMINAL_STATUSES).optional(),
  operation: z.string().optional(),
  errorCode: z.string().optional(),
  attempt: z.number().int().nonnegative().optional(),
  providerId: z.string().optional(),
  modelId: z.string().optional(),
  agentName: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export type ObservabilityEventParsed = z.infer<typeof observabilityEventSchema>;

/** Parse an unknown value into a validated event envelope. */
export function parseObservabilityEvent(value: unknown): ObservabilityEventParsed {
  return observabilityEventSchema.parse(value);
}

export const OBSERVABILITY_SPAN_KINDS = ['internal', 'ai', 'tool', 'db'] as const;
export type ObservabilitySpanKind = (typeof OBSERVABILITY_SPAN_KINDS)[number];

/**
 * The span half of the unified run envelope. One span carries the trace
 * correlation plus cost/latency/status attributes so tests, production
 * traces, eval reports, and feedback records all describe the same run.
 */
export const observabilitySpanSchema = z.object({
  traceId: z.string().min(1),
  spanId: z.string().min(1),
  parentSpanId: z.string().optional(),
  name: z.string().min(1),
  kind: z.enum(OBSERVABILITY_SPAN_KINDS).default('internal'),
  startTimeMs: z.number().nonnegative(),
  endTimeMs: z.number().nonnegative().optional(),
  durationMs: z.number().nonnegative().optional(),
  status: z.enum(OBSERVABILITY_TERMINAL_STATUSES).optional(),
  errorCode: z.string().optional(),
  attributes: z.record(z.unknown()).optional(),
});

export type ObservabilitySpan = z.infer<typeof observabilitySpanSchema>;

export function parseObservabilitySpan(value: unknown): ObservabilitySpan {
  return observabilitySpanSchema.parse(value);
}
