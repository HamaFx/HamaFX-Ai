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

// Cron run query helpers.

import { and, desc, eq, gte, lt, sql } from 'drizzle-orm';
import { getDb, schema } from '../client';

export type CronRunRow = typeof schema.cronRuns.$inferSelect;

export async function listCronRuns(
  opts: { since?: Date; jobName?: string | undefined; limit?: number } = {},
): Promise<CronRunRow[]> {
  const db = getDb();
  const conditions: ReturnType<typeof and>[] = [];
  if (opts.since) conditions.push(gte(schema.cronRuns.startedAt, opts.since));
  if (opts.jobName) conditions.push(eq(schema.cronRuns.jobName, opts.jobName));

  return db
    .select()
    .from(schema.cronRuns)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(schema.cronRuns.startedAt))
    .limit(opts.limit ?? 100);
}

export async function deleteOldCronRuns(cutoff: Date): Promise<void> {
  const db = getDb();
  await db.delete(schema.cronRuns).where(lt(schema.cronRuns.startedAt, cutoff));
}
