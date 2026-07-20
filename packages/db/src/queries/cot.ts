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

// PF-01 Phase 2 — COT report query helpers.

import { desc, eq } from 'drizzle-orm';
import { getDb, schema } from '../client';

export type CotReportRow = typeof schema.cotReports.$inferSelect;
export type CreateCotReportInput = typeof schema.cotReports.$inferInsert;

export async function listCotReports(symbol: string, limit = 10): Promise<CotReportRow[]> {
  const db = getDb();
  return db
    .select()
    .from(schema.cotReports)
    .where(eq(schema.cotReports.symbol, symbol))
    .orderBy(desc(schema.cotReports.reportDate))
    .limit(limit);
}

export async function getCotReport(id: string): Promise<CotReportRow | undefined> {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.cotReports)
    .where(eq(schema.cotReports.id, id))
    .limit(1);
  return rows[0];
}

export async function upsertCotReport(input: CreateCotReportInput): Promise<CotReportRow> {
  const db = getDb();
  const rows = await db
    .insert(schema.cotReports)
    .values(input)
    .onConflictDoUpdate({ target: schema.cotReports.id, set: input })
    .returning();
  return rows[0]!;
}

export async function countCotReports(): Promise<number> {
  const db = getDb();
  const rows = await db.select({ count: schema.cotReports.id }).from(schema.cotReports);
  return rows.length;
}
