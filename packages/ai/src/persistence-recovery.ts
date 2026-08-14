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

// Phase 5 — bounded persistence outbox replay.

import { randomUUID } from 'node:crypto';

import { sql } from 'drizzle-orm';
import type { UIMessage } from 'ai';
import { createCategorizedLogger } from '@kestrel/shared/logger';

import { getDb } from './db';
import { appendAssistantMessage, appendUserMessage } from './persistence/message-persistence';
import type { TelemetryInput, ToolTelemetryInput } from './persistence/telemetry-persistence';
import { recordTelemetry, recordToolTelemetry } from './persistence/telemetry-persistence';
import { saveAgentOpinions, type SaveOpinionsArgs } from './multi-agent/persistence';
import { persistTraceStrict, type PersistedTrace } from './diagnostics/trace-persistence';

const rlog = createCategorizedLogger('ai', { component: 'persistence-recovery' });
const LOCK_TTL_MS = 5 * 60 * 1000;
const MAX_BACKOFF_MS = 60 * 60 * 1000;

interface ClaimedFailure {
  id: string;
  operation: string;
  payload: Record<string, unknown>;
  attemptCount: number;
  maxAttempts: number;
  lockToken: string;
}

function resultRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (typeof result === 'object' && result !== null && 'rows' in result) {
    const rows = (result as { rows?: unknown }).rows;
    return Array.isArray(rows) ? rows as T[] : [];
  }
  return [];
}

function asRecord(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`outbox payload field ${field} must be an object`);
  }
  return value as Record<string, unknown>;
}

function asString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) throw new Error(`outbox payload field ${field} is invalid`);
  return value;
}

async function claimOne(): Promise<ClaimedFailure | null> {
  const lockToken = randomUUID();
  const lockedUntil = new Date(Date.now() + LOCK_TTL_MS);
  return getDb().transaction(async (tx) => {
    const rows = resultRows<{
      id: string;
      operation: string;
      payload: Record<string, unknown>;
      attempt_count: number | string;
      max_attempts: number | string;
    }>(await tx.execute(sql`
      SELECT id, operation, payload, attempt_count, max_attempts
      FROM persistence_outbox
      WHERE (
          status IN ('pending', 'failed')
          OR (status = 'processing' AND locked_until < now())
        )
        AND next_attempt_at <= now()
        AND attempt_count < max_attempts
        AND (locked_until IS NULL OR locked_until < now())
      ORDER BY next_attempt_at ASC, created_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    `));
    const row = rows[0];
    if (!row) return null;

    const nextAttempt = Number(row.attempt_count) + 1;
    const updated = resultRows<{ id: string }>(await tx.execute(sql`
      UPDATE persistence_outbox
      SET status = 'processing',
          attempt_count = ${nextAttempt},
          locked_until = ${lockedUntil},
          lock_token = ${lockToken},
          updated_at = now()
      WHERE id = ${row.id}
        AND (
          status IN ('pending', 'failed')
          OR (status = 'processing' AND locked_until < now())
        )
      RETURNING id
    `));
    if (updated.length === 0) return null;

    return {
      id: row.id,
      operation: row.operation,
      payload: row.payload,
      attemptCount: nextAttempt,
      maxAttempts: Number(row.max_attempts),
      lockToken,
    };
  });
}

async function markCompleted(item: ClaimedFailure): Promise<void> {
  await getDb().execute(sql`
    UPDATE persistence_outbox
    SET status = 'completed',
        locked_until = NULL,
        lock_token = NULL,
        last_error = NULL,
        completed_at = now(),
        updated_at = now()
    WHERE id = ${item.id} AND status = 'processing' AND lock_token = ${item.lockToken}
  `);
}

async function markFailed(item: ClaimedFailure, error: unknown): Promise<void> {
  const delayMs = Math.min(MAX_BACKOFF_MS, 1_000 * 2 ** Math.min(item.attemptCount - 1, 10));
  const nextAttemptAt = new Date(Date.now() + delayMs);
  const message = error instanceof Error ? error.message : String(error);
  const nextStatus = item.attemptCount >= item.maxAttempts ? 'dead' : 'failed';
  await getDb().execute(sql`
    UPDATE persistence_outbox
    SET status = ${nextStatus},
        locked_until = NULL,
        lock_token = NULL,
        last_error = ${message.slice(0, 2_000)},
        next_attempt_at = ${nextAttemptAt},
        updated_at = now()
    WHERE id = ${item.id} AND status = 'processing' AND lock_token = ${item.lockToken}
  `);
}

async function replayOne(item: ClaimedFailure): Promise<void> {
  const payload = item.payload;
  switch (item.operation) {
    case 'message.user': {
      const message = asRecord(payload.message, 'message') as unknown as UIMessage;
      await appendUserMessage(
        asString(payload.userId, 'userId'),
        asString(payload.threadId, 'threadId'),
        message,
        { idempotencyKey: asString(payload.idempotencyKey, 'idempotencyKey') },
      );
      return;
    }
    case 'message.assistant': {
      const message = asRecord(payload.message, 'message') as unknown as UIMessage;
      await appendAssistantMessage(
        asString(payload.userId, 'userId'),
        asString(payload.threadId, 'threadId'),
        message,
        { idempotencyKey: asString(payload.idempotencyKey, 'idempotencyKey') },
      );
      return;
    }
    case 'agent.opinions':
      await saveAgentOpinions(payload as unknown as SaveOpinionsArgs);
      return;
    case 'telemetry.turn':
      await recordTelemetry(payload as unknown as TelemetryInput);
      return;
    case 'telemetry.tool':
      if (!(await recordToolTelemetry(payload as unknown as ToolTelemetryInput))) {
        throw new Error('tool telemetry replay returned false');
      }
      return;
    case 'diagnostic.trace':
      await persistTraceStrict(payload as unknown as PersistedTrace);
      return;
    default:
      throw new Error(`unsupported persistence outbox operation: ${item.operation}`);
  }
}

/** Process at most `limit` replay records and return terminal counters. */
export async function replayPersistenceFailures(limit = 25): Promise<{
  claimed: number;
  completed: number;
  failed: number;
  dead: number;
}> {
  const boundedLimit = Math.max(1, Math.min(100, Math.floor(limit)));
  let claimed = 0;
  let completed = 0;
  let failed = 0;
  let dead = 0;

  for (let i = 0; i < boundedLimit; i++) {
    const item = await claimOne();
    if (!item) break;
    claimed += 1;
    try {
      await replayOne(item);
      await markCompleted(item);
      completed += 1;
    } catch (err) {
      await markFailed(item, err);
      if (item.attemptCount >= item.maxAttempts) dead += 1;
      else failed += 1;
      rlog.error('persistence outbox replay failed', {
        outboxId: item.id,
        operation: item.operation,
        attempt: item.attemptCount,
        maxAttempts: item.maxAttempts,
        err: String(err),
      });
    }
  }

  return { claimed, completed, failed, dead };
}
