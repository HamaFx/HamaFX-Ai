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

import { desc, gte, sql } from 'drizzle-orm';
import { z } from 'zod';

import { getDb, schema } from '@hamafx/db';

import { withAdminAuth } from '@/lib/admin-auth';
import { parseSearchParams } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const querySchema = z.object({
  days: z.coerce.number().int().min(1).max(90).default(7),
  jobName: z.string().optional(),
});

export const GET = withAdminAuth(async (req) => {
  const { days, jobName } = parseSearchParams(req, querySchema);

  const db = getDb();
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const runs = await db
    .select()
    .from(schema.cronRuns)
    .where(
      jobName
        ? sql`${schema.cronRuns.jobName} = ${jobName} AND ${schema.cronRuns.startedAt} >= ${since}`
        : gte(schema.cronRuns.startedAt, since),
    )
    .orderBy(desc(schema.cronRuns.startedAt));

  return Response.json({ runs });
});
