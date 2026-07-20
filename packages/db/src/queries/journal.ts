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

// PF-01 Phase 2 — Journal entry query helpers.

import { and, count, desc, eq, isNull } from 'drizzle-orm';
import { getDb, schema } from '../client';

export type JournalRow = typeof schema.journalEntries.$inferSelect;
export type CreateJournalInput = typeof schema.journalEntries.$inferInsert;

export async function listJournalEntries(
  userId: string,
  opts?: { symbol?: string; limit?: number; offset?: number },
): Promise<JournalRow[]> {
  const conditions = [eq(schema.journalEntries.userId, userId), isNull(schema.journalEntries.deletedAt)];
  if (opts?.symbol) conditions.push(eq(schema.journalEntries.symbol, opts.symbol));
  const db = getDb();
  return db
    .select()
    .from(schema.journalEntries)
    .where(and(...conditions))
    .orderBy(desc(schema.journalEntries.openedAt))
    .limit(opts?.limit ?? 50)
    .offset(opts?.offset ?? 0);
}

export async function getJournalEntry(id: string, userId: string): Promise<JournalRow | undefined> {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.journalEntries)
    .where(and(eq(schema.journalEntries.id, id), eq(schema.journalEntries.userId, userId)))
    .limit(1);
  return rows[0];
}

export async function createJournalEntry(input: CreateJournalInput): Promise<JournalRow> {
  const db = getDb();
  const rows = await db.insert(schema.journalEntries).values(input).returning();
  return rows[0]!;
}

export async function updateJournalEntry(
  id: string,
  userId: string,
  data: Partial<Omit<JournalRow, 'id' | 'userId' | 'createdAt'>>,
): Promise<JournalRow | undefined> {
  const db = getDb();
  const rows = await db
    .update(schema.journalEntries)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(schema.journalEntries.id, id), eq(schema.journalEntries.userId, userId)))
    .returning();
  return rows[0];
}

export async function deleteJournalEntry(id: string, userId: string): Promise<void> {
  const db = getDb();
  await db
    .update(schema.journalEntries)
    .set({ deletedAt: new Date() })
    .where(and(eq(schema.journalEntries.id, id), eq(schema.journalEntries.userId, userId)));
}

export async function countJournalEntriesByUser(userId: string): Promise<number> {
  const db = getDb();
  const rows = await db
    .select({ total: count() })
    .from(schema.journalEntries)
    .where(and(eq(schema.journalEntries.userId, userId), isNull(schema.journalEntries.deletedAt)));
  return rows[0]?.total ?? 0;
}
