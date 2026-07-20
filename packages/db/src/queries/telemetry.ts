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

// PF-01 Phase 2 — Chat telemetry query helpers.

import { and, between, desc, eq } from 'drizzle-orm';
import { getDb, schema } from '../client';

export type TelemetryRow = typeof schema.chatTelemetry.$inferSelect;

export async function listTelemetry(
  userId: string,
  opts?: { from?: Date; to?: Date; limit?: number },
): Promise<TelemetryRow[]> {
  const conditions = [eq(schema.chatTelemetry.userId, userId)];
  if (opts?.from && opts?.to) conditions.push(between(schema.chatTelemetry.createdAt, opts.from, opts.to));
  const db = getDb();
  return db
    .select()
    .from(schema.chatTelemetry)
    .where(and(...conditions))
    .orderBy(desc(schema.chatTelemetry.createdAt))
    .limit(opts?.limit ?? 100);
}

export async function recordTelemetry(
  data: Omit<typeof schema.chatTelemetry.$inferInsert, 'id' | 'createdAt'>,
): Promise<TelemetryRow> {
  const db = getDb();
  const rows = await db.insert(schema.chatTelemetry).values(data).returning();
  return rows[0]!;
}

export async function getDailySpend(
  userId: string,
  date: Date,
): Promise<{ estimatedCost: number; tokenCount: number }> {
  const start = new Date(date);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);

  const db = getDb();
  const rows = await db
    .select({
      estCostUsd: schema.chatTelemetry.estCostUsd,
      inputTokens: schema.chatTelemetry.inputTokens,
      outputTokens: schema.chatTelemetry.outputTokens,
    })
    .from(schema.chatTelemetry)
    .where(
      and(
        eq(schema.chatTelemetry.userId, userId),
        between(schema.chatTelemetry.createdAt, start, end),
      ),
    );

  return {
    estimatedCost: rows.reduce((sum, r) => sum + Number(r.estCostUsd), 0),
    tokenCount: rows.reduce((sum, r) => sum + r.inputTokens + r.outputTokens, 0),
  };
}
