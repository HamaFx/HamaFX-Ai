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

// Diagnostic trace query helpers.

import { and, desc, eq } from 'drizzle-orm';
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
    .limit(opts.limit ?? 20);
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
