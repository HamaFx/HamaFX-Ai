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

// P1 — Telemetry persistence (SRP split from persistence.ts).
// Turn-level and tool-level telemetry writers.

import { schema } from '@hamafx/db';
import { getDb } from '../db';
import { createCategorizedLogger } from '@hamafx/shared/logger';

import { estimateCostUsd } from '../cost';

const perlog = createCategorizedLogger('ai', { component: 'persistence' });

// ---------------------------------------------------------------------------
// Turn telemetry
// ---------------------------------------------------------------------------

export interface TelemetryInput {
  threadId: string;
  userId?: string | null;
  messageId: string | null;
  model: string;
  inputTokens: number;
  outputTokens: number;
  toolCalls: number;
  ms: number;
  kind?:
    | 'title_generated'
    | 'title_failed'
    | 'title_skipped_budget'
    | 'routing_fundamental'
    | 'routing_technical'
    | 'routing_summary'
    | 'routing_vision'
    | 'routing_generic'
    | 'plan_generated'
    | 'plan_skipped_budget'
    | 'plan_failed'
    | 'multi_specialist_technical'
    | 'multi_specialist_fundamental'
    | 'multi_specialist_risk'
    | 'multi_specialist_sentiment'
    | 'multi_specialist_decision';
}

export async function recordTelemetry(t: TelemetryInput): Promise<void> {
  const userId = t.userId ?? '__system__';
  await getDb()
    .insert(schema.chatTelemetry)
    .values({
      userId,
      threadId: t.threadId,
      messageId: t.messageId,
      model: t.model,
      inputTokens: t.inputTokens,
      outputTokens: t.outputTokens,
      toolCalls: t.toolCalls,
      ms: t.ms,
      estCostUsd: estimateCostUsd(t.model, t.inputTokens, t.outputTokens),
      kind: t.kind ?? null,
    });
}

// ---------------------------------------------------------------------------
// Tool telemetry
// ---------------------------------------------------------------------------

export interface ToolTelemetryInput {
  threadId: string | null;
  userId?: string | null;
  messageId: string | null;
  tool: string;
  ms: number;
  ok: boolean;
  errorCode?: string | null;
  outputChars?: number | null;
}

export async function recordToolTelemetry(t: ToolTelemetryInput): Promise<void> {
  try {
    const userId = t.userId ?? '__system__';
    await getDb()
      .insert(schema.chatToolTelemetry)
      .values({
        userId,
        threadId: t.threadId,
        messageId: t.messageId,
        tool: t.tool,
        ms: t.ms,
        ok: t.ok,
        errorCode: t.errorCode ?? null,
        outputChars: t.outputChars ?? null,
      });
  } catch (err) {
    perlog.warn('tool telemetry insert failed', { err: String(err) });
  }
}
