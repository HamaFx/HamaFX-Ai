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

// Multi-Agent Orchestration — opinion persistence.

import { schema } from '@kestrel/db';
import { container } from '@kestrel/shared';
import { DB } from '../tokens';
import { and, asc, eq } from 'drizzle-orm';
import type { AgentOpinionRow } from '@kestrel/db/schema';
import { enqueuePersistenceFailure } from '../persistence-outbox';
import { getDiagnosticContext } from '../diagnostics/run-context';

export interface SaveOpinionsArgs {
  userId: string;
  threadId: string;
  messageId: string;
  analysisMode: string;
  opinions: Array<{
    agentName: string;
    bias: string;
    confidence: number;
    reasoning: string;
    rawData: Record<string, unknown>;
    model: string;
    costUsd: number;
    latencyMs: number;
  }>;
}

export async function saveAgentOpinions(args: SaveOpinionsArgs): Promise<void> {
  const db = container.resolve(DB);
  if (args.opinions.length === 0) return;
  try {
    await db.insert(schema.agentOpinions).values(
      args.opinions.map((op) => ({
        userId: args.userId,
        threadId: args.threadId,
        messageId: args.messageId,
        agentName: op.agentName,
        bias: op.bias,
        confidence: op.confidence,
        reasoning: op.reasoning,
        rawData: op.rawData,
        model: op.model,
        costUsd: op.costUsd,
        latencyMs: op.latencyMs,
        analysisMode: args.analysisMode,
      })),
    ).onConflictDoNothing({
      target: [schema.agentOpinions.messageId, schema.agentOpinions.agentName],
    });
  } catch (err) {
    const context = getDiagnosticContext();
    await enqueuePersistenceFailure({
      userId: args.userId,
      operation: 'agent.opinions',
      dedupeKey: `agent.opinions:${args.messageId}`,
      threadId: args.threadId,
      messageId: args.messageId,
      traceId: context?.traceId,
      runId: context?.runId,
      jobId: context?.jobId,
      payload: args as unknown as Record<string, unknown>,
      error: err,
    });
    throw err;
  }
}

/** S1 fix — scope agent opinion queries by userId to prevent cross-tenant data leaks. */
export async function listAgentOpinions(userId: string, threadId: string): Promise<AgentOpinionRow[]> {
  const db = container.resolve(DB);
  return db.select().from(schema.agentOpinions)
    .where(and(eq(schema.agentOpinions.userId, userId), eq(schema.agentOpinions.threadId, threadId)))
    .orderBy(asc(schema.agentOpinions.createdAt));
}

export async function listMessageOpinions(userId: string, messageId: string): Promise<AgentOpinionRow[]> {
  const db = container.resolve(DB);
  return db.select().from(schema.agentOpinions)
    .where(and(eq(schema.agentOpinions.userId, userId), eq(schema.agentOpinions.messageId, messageId)))
    .orderBy(asc(schema.agentOpinions.createdAt));
}