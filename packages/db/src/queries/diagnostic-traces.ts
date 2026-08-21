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

// Diagnostic trace query helpers and the admin correlation timeline.

import { and, desc, eq, inArray, or, type SQL } from 'drizzle-orm';
import { getDb, schema } from '../client';

export type DiagnosticTraceRow = typeof schema.diagnosticTraces.$inferSelect;
export type DiagnosticTraceInsert = typeof schema.diagnosticTraces.$inferInsert;

export async function listDiagnosticTraces(
  opts: { threadId?: string | undefined; limit?: number } = {},
): Promise<DiagnosticTraceRow[]> {
  const conditions: ReturnType<typeof and>[] = [];
  if (opts.threadId) conditions.push(eq(schema.diagnosticTraces.threadId, opts.threadId));

  const db = getDb();
  return db
    .select()
    .from(schema.diagnosticTraces)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(schema.diagnosticTraces.startedAt))
    .limit(Math.min(100, Math.max(1, opts.limit ?? 20)));
}

export async function getDiagnosticTrace(id: string): Promise<DiagnosticTraceRow | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.diagnosticTraces)
    .where(eq(schema.diagnosticTraces.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export async function insertDiagnosticTrace(row: DiagnosticTraceInsert): Promise<void> {
  const db = getDb();
  await db.insert(schema.diagnosticTraces).values(row);
}

export interface TraceExplorerFilters {
  traceId?: string | undefined;
  runId?: string | undefined;
  jobId?: string | undefined;
  threadId?: string | undefined;
  messageId?: string | undefined;
  limit?: number | undefined;
}

export type TraceExplorerSource =
  | 'trace'
  | 'turn'
  | 'tool'
  | 'agent'
  | 'budget'
  | 'outbox';

export interface TraceExplorerEvent {
  id: string;
  source: TraceExplorerSource;
  timestamp: Date;
  name: string;
  status: string;
  traceId: string | null;
  runId: string | null;
  jobId: string | null;
  threadId: string | null;
  messageId: string | null;
  userId: string | null;
  durationMs: number | null;
  error: string | null;
  metadata: Record<string, unknown> | null;
}

function boundedLimit(limit: number | undefined): number {
  return Math.min(100, Math.max(1, Math.floor(limit ?? 100)));
}

function allMatch(conditions: SQL[]): SQL | undefined {
  return conditions.length > 0 ? and(...conditions) : undefined;
}

/**
 * Return a bounded, correlation-aware timeline for admin incident debugging.
 * Every source query uses its existing correlation/thread/message indexes; the
 * final merge is capped so an incident cannot create an unbounded response.
 */
export async function listTraceExplorerEvents(
  filters: TraceExplorerFilters = {},
): Promise<TraceExplorerEvent[]> {
  const limit = boundedLimit(filters.limit);
  const db = getDb();

  const [traces, turns, tools, budgets, outbox] = await Promise.all([
    filters.messageId || filters.runId || filters.jobId
      ? Promise.resolve([] as DiagnosticTraceRow[])
      : db
          .select()
          .from(schema.diagnosticTraces)
          .where(filters.traceId || filters.threadId
            ? allMatch([
                ...(filters.traceId ? [eq(schema.diagnosticTraces.id, filters.traceId)] : []),
                ...(filters.threadId ? [eq(schema.diagnosticTraces.threadId, filters.threadId)] : []),
              ])
            : undefined)
          .orderBy(desc(schema.diagnosticTraces.startedAt))
          .limit(limit),
    db
      .select()
      .from(schema.chatTelemetry)
      .where(allMatch([
        ...(filters.traceId ? [eq(schema.chatTelemetry.traceId, filters.traceId)] : []),
        ...(filters.runId ? [eq(schema.chatTelemetry.runId, filters.runId)] : []),
        ...(filters.jobId ? [eq(schema.chatTelemetry.jobId, filters.jobId)] : []),
        ...(filters.threadId ? [eq(schema.chatTelemetry.threadId, filters.threadId)] : []),
        ...(filters.messageId ? [eq(schema.chatTelemetry.messageId, filters.messageId)] : []),
      ]))
      .orderBy(desc(schema.chatTelemetry.createdAt))
      .limit(limit),
    db
      .select()
      .from(schema.chatToolTelemetry)
      .where(allMatch([
        ...(filters.traceId ? [eq(schema.chatToolTelemetry.traceId, filters.traceId)] : []),
        ...(filters.runId ? [eq(schema.chatToolTelemetry.runId, filters.runId)] : []),
        ...(filters.jobId ? [eq(schema.chatToolTelemetry.jobId, filters.jobId)] : []),
        ...(filters.threadId ? [eq(schema.chatToolTelemetry.threadId, filters.threadId)] : []),
        ...(filters.messageId ? [eq(schema.chatToolTelemetry.messageId, filters.messageId)] : []),
      ]))
      .orderBy(desc(schema.chatToolTelemetry.createdAt))
      .limit(limit),
    db
      .select()
      .from(schema.aiBudgetReservations)
      .where(allMatch([
        ...(filters.traceId ? [eq(schema.aiBudgetReservations.traceId, filters.traceId)] : []),
        ...(filters.runId ? [eq(schema.aiBudgetReservations.runId, filters.runId)] : []),
        ...(filters.jobId ? [eq(schema.aiBudgetReservations.jobId, filters.jobId)] : []),
        ...(filters.threadId ? [eq(schema.aiBudgetReservations.threadId, filters.threadId)] : []),
      ]))
      .orderBy(desc(schema.aiBudgetReservations.createdAt))
      .limit(limit),
    db
      .select()
      .from(schema.persistenceOutbox)
      .where(allMatch([
        ...(filters.traceId ? [eq(schema.persistenceOutbox.traceId, filters.traceId)] : []),
        ...(filters.runId ? [eq(schema.persistenceOutbox.runId, filters.runId)] : []),
        ...(filters.jobId ? [eq(schema.persistenceOutbox.jobId, filters.jobId)] : []),
        ...(filters.threadId ? [eq(schema.persistenceOutbox.threadId, filters.threadId)] : []),
        ...(filters.messageId ? [eq(schema.persistenceOutbox.messageId, filters.messageId)] : []),
      ]))
      .orderBy(desc(schema.persistenceOutbox.updatedAt))
      .limit(limit),
  ]);

  const correlatedMessageIds = turns
    .map((row) => row.messageId)
    .filter((id): id is string => typeof id === 'string');
  const correlatedThreadIds = turns
    .map((row) => row.threadId)
    .filter((id): id is string => typeof id === 'string');

  const opinionConditions: SQL[] = [];
  if (filters.messageId) opinionConditions.push(eq(schema.agentOpinions.messageId, filters.messageId));
  if (filters.threadId) opinionConditions.push(eq(schema.agentOpinions.threadId, filters.threadId));
  if (correlatedMessageIds.length > 0) opinionConditions.push(inArray(schema.agentOpinions.messageId, correlatedMessageIds));
  if (correlatedThreadIds.length > 0) opinionConditions.push(inArray(schema.agentOpinions.threadId, correlatedThreadIds));

  const opinions = opinionConditions.length > 0
    ? await db
        .select()
        .from(schema.agentOpinions)
        .where(or(...opinionConditions))
        .orderBy(desc(schema.agentOpinions.createdAt))
        .limit(limit)
    : [];

  const events: TraceExplorerEvent[] = [
    ...traces.map((row) => ({
      id: `trace:${row.id}`,
      source: 'trace' as const,
      timestamp: row.startedAt,
      name: 'diagnostic.trace',
      status: row.status,
      traceId: row.id,
      runId: null,
      jobId: null,
      threadId: row.threadId,
      messageId: null,
      userId: row.userId,
      durationMs: row.durationMs,
      error: row.errorCount > 0 ? `${row.errorCount} diagnostic error(s)` : null,
      metadata: { stepCount: row.stepCount, errorCount: row.errorCount },
    })),
    ...turns.map((row) => ({
      id: `turn:${row.id}`,
      source: 'turn' as const,
      timestamp: row.createdAt,
      name: row.kind ?? 'chat.turn',
      status: row.kind?.endsWith('_failed') || row.kind === 'turn_failed' ? 'failed' : 'completed',
      traceId: row.traceId,
      runId: row.runId,
      jobId: row.jobId,
      threadId: row.threadId,
      messageId: row.messageId,
      userId: row.userId,
      durationMs: row.ms,
      error: row.kind?.endsWith('_failed') || row.kind === 'turn_failed' ? 'Telemetry marked failed' : null,
      metadata: {
        model: row.model,
        inputTokens: row.inputTokens,
        outputTokens: row.outputTokens,
        toolCalls: row.toolCalls,
        estCostUsd: row.estCostUsd,
      },
    })),
    ...tools.map((row) => ({
      id: `tool:${row.id}`,
      source: 'tool' as const,
      timestamp: row.createdAt,
      name: `tool:${row.tool}`,
      status: row.ok ? 'completed' : 'failed',
      traceId: row.traceId,
      runId: row.runId,
      jobId: row.jobId,
      threadId: row.threadId,
      messageId: row.messageId,
      userId: row.userId,
      durationMs: row.ms,
      error: row.ok ? null : row.errorCode ?? 'Tool failed',
      metadata: { outputChars: row.outputChars },
    })),
    ...opinions.map((row) => ({
      id: `agent:${row.id}`,
      source: 'agent' as const,
      timestamp: row.createdAt,
      name: `agent:${row.agentName}`,
      status: 'completed',
      traceId: filters.traceId ?? null,
      runId: filters.runId ?? null,
      jobId: filters.jobId ?? null,
      threadId: row.threadId,
      messageId: row.messageId,
      userId: row.userId,
      durationMs: row.latencyMs,
      error: null,
      metadata: {
        bias: row.bias,
        confidence: row.confidence,
        model: row.model,
        costUsd: row.costUsd,
        reasoning: row.reasoning,
      },
    })),
    ...budgets.map((row) => ({
      id: `budget:${row.id}`,
      source: 'budget' as const,
      timestamp: row.resolvedAt ?? row.createdAt,
      name: 'budget.reservation',
      status: row.status,
      traceId: row.traceId,
      runId: row.runId,
      jobId: row.jobId,
      threadId: row.threadId,
      messageId: null,
      userId: row.userId,
      durationMs: null,
      error: row.lastError,
      metadata: { reservedUsdCents: row.reservedUsdCents, actualUsdCents: row.actualUsdCents, day: row.day },
    })),
    ...outbox.map((row) => ({
      id: `outbox:${row.id}`,
      source: 'outbox' as const,
      timestamp: row.completedAt ?? row.updatedAt,
      name: row.operation,
      status: row.status,
      traceId: row.traceId,
      runId: row.runId,
      jobId: row.jobId,
      threadId: row.threadId,
      messageId: row.messageId,
      userId: row.userId,
      durationMs: null,
      error: row.lastError,
      metadata: { attemptCount: row.attemptCount, maxAttempts: row.maxAttempts, dedupeKey: row.dedupeKey },
    })),
  ];

  return events
    .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
    .slice(0, limit);
}
